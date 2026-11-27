// School news - the school news / advert column (migration 0021).
// ONE feature: the admin posts news with an audience (everybody,
// parents of particular classes, or teachers only) and every
// audience member gets one in-app notification row (kind 'news').
// The older `announcements` table (migration 0001) is a different
// feature and is not used here.

import { supabase } from "@/lib/supabase";
import { LOGO_BUCKET, LOGO_ACCEPT_ATTR, validateLogoFile } from "@/lib/logo";

export type NewsAudience = "everybody" | "parents_of_classes" | "teachers_only";

export type SchoolNewsItem = {
  id: string;
  school_id: string;
  title: string;
  body: string;
  image_url: string | null;
  audience_type: NewsAudience;
  class_ids: string[];
  status: string;
  created_by: string | null;
  created_at: string;
};

/** The only profile fields news needs: role, and the parent row id
 *  when resolving a parent's children. Pass the signed-in profile. */
export type NewsProfile = {
  role: string;
  parent_id: string | null;
};

export const NEWS_AUDIENCE_LABELS: Record<NewsAudience, string> = {
  everybody: "Everybody in the school",
  parents_of_classes: "Parents of particular classes",
  teachers_only: "Teachers only",
};

/** True when this user may see this news row. */
export function canSeeNews(
  item: SchoolNewsItem,
  profile: NewsProfile | null,
  childClassIds: string[],
): boolean {
  if (!profile) return false;
  if (item.audience_type === "everybody") return true;
  if (item.audience_type === "teachers_only") {
    return (
      profile.role === "teacher" ||
      profile.role === "school_admin" ||
      profile.role === "platform_owner"
    );
  }
  // parents_of_classes
  if (profile.role !== "parent") return false;
  return (item.class_ids ?? []).some((c) => childClassIds.includes(c));
}

/** Published news this user may see, newest first. The audience
 *  filter runs in the app (RLS only guarantees same-school reads). */
export async function fetchNewsForUser(
  schoolId: string,
  profile: NewsProfile | null,
  childClassIds: string[],
): Promise<SchoolNewsItem[]> {
  const { data } = await supabase
    .from("school_news")
    .select("*")
    .eq("school_id", schoolId)
    .eq("status", "Published")
    .order("created_at", { ascending: false });
  const rows = (data as SchoolNewsItem[] | null) ?? [];
  return rows.filter((item) => canSeeNews(item, profile, childClassIds));
}

/** All published news in a school, newest first (admin list). */
export async function fetchAllNews(schoolId: string): Promise<SchoolNewsItem[]> {
  const { data } = await supabase
    .from("school_news")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  return (data as SchoolNewsItem[] | null) ?? [];
}

/** Upload a news picture. Same bucket and rules as the school logo
 *  (migration 0003): public read, upload by the platform owner or
 *  the school's own school_admin, path under the school's id. */
export async function uploadNewsImage(
  schoolId: string,
  file: File,
): Promise<{ url?: string; error?: string }> {
  const problem = validateLogoFile(file);
  if (problem) return { error: problem };
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${schoolId}/news/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) return { error: `Could not upload picture: ${error.message}` };
  const {
    data: { publicUrl },
  } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return { url: publicUrl };
}

export type CreateNewsInput = {
  schoolId: string;
  createdBy: string | null;
  title: string;
  body: string;
  imageUrl?: string | null;
  audience: NewsAudience;
  classIds?: string[];
};

/** Post news (school_admin / platform_owner only, enforced by RLS)
 *  and fan out one notification row per audience member into the
 *  existing notifications table (same insert shape as
 *  src/lib/absence-emails.ts: school_id, recipient_id, kind, title,
 *  body, link). The notification fan-out is best-effort: if it
 *  fails, the news is still posted and the error is reported. */
export async function createNews(input: CreateNewsInput): Promise<{
  ok: boolean;
  id?: string;
  notified?: number;
  error?: string;
  notifyError?: string;
}> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: "Title and body are required." };
  if (input.audience === "parents_of_classes" && (input.classIds ?? []).length === 0) {
    return { ok: false, error: "Pick at least one class for parents of particular classes." };
  }
  const { data, error } = await supabase
    .from("school_news")
    .insert({
      school_id: input.schoolId,
      title,
      body,
      image_url: input.imageUrl ?? null,
      audience_type: input.audience,
      class_ids: input.audience === "parents_of_classes" ? (input.classIds ?? []) : [],
      status: "Published",
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: `Could not post news: ${error?.message ?? "unknown error"}` };
  }
  const newsId = (data as { id: string }).id;

  // Resolve recipients: profiles in this school, filtered by role;
  // for parents_of_classes, only parents with an approved link to a
  // pupil in one of the chosen classes.
  let notifyError: string | undefined;
  let notified = 0;
  try {
    let recipientIds: string[] = [];
    if (input.audience === "parents_of_classes") {
      const classIds = input.classIds ?? [];
      const { data: links } = await supabase
        .from("parent_children")
        .select("parent_id, students!inner(class_id)")
        .eq("status", "Approved")
        .in("students.class_id", classIds);
      const parentIds = [
        ...new Set(
          ((links as { parent_id: string }[] | null) ?? []).map((l) => l.parent_id),
        ),
      ];
      if (parentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("school_id", input.schoolId)
          .eq("role", "parent")
          .eq("status", "Active")
          .in("parent_id", parentIds);
        recipientIds = ((profiles as { id: string }[] | null) ?? []).map((p) => p.id);
      }
    } else if (input.audience === "teachers_only") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("school_id", input.schoolId)
        .eq("status", "Active")
        .in("role", ["teacher", "school_admin"]);
      recipientIds = ((profiles as { id: string }[] | null) ?? []).map((p) => p.id);
    } else {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("school_id", input.schoolId)
        .eq("status", "Active");
      recipientIds = ((profiles as { id: string }[] | null) ?? []).map((p) => p.id);
    }
    if (recipientIds.length > 0) {
      // Write via the notify_recipients RPC (migration 0027):
      // direct notification inserts are admin-only under RLS.
      const { data: nCount, error: nErr } = await supabase.rpc("notify_recipients", {
        p_school_id: input.schoolId,
        p_recipient_ids: recipientIds,
        p_kind: "news",
        p_title: `New school news: ${title}`,
        p_body: body.slice(0, 120),
        p_link: "/news",
      });
      if (nErr) notifyError = nErr.message;
      else notified = typeof nCount === "number" ? nCount : recipientIds.length;
    }
  } catch (e) {
    notifyError = e instanceof Error ? e.message : "unknown error";
  }
  return { ok: true, id: newsId, notified, notifyError };
}

/** Delete a news post (school_admin / platform_owner only, RLS).
 *  Also removes its picture file from the school-logos bucket when
 *  one was saved there. */
export async function deleteNews(item: SchoolNewsItem): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("school_news").delete().eq("id", item.id);
  if (error) return { ok: false, error: `Could not delete news: ${error.message}` };
  if (item.image_url) {
    const marker = `${LOGO_BUCKET}/`;
    const idx = item.image_url.indexOf(marker);
    if (idx >= 0) {
      const path = item.image_url.slice(idx + marker.length);
      await supabase.storage.from(LOGO_BUCKET).remove([path]);
    }
  }
  return { ok: true };
}

export { LOGO_ACCEPT_ATTR };
