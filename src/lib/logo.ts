import { supabase } from "@/lib/supabase";

/** School logos live in Supabase Storage, one file per school:
 *  `school-logos/<school_id>/logo.<ext>`. The public URL is saved in
 *  `schools.logo_url` (column from migration 0001) and shown in the
 *  portal header, on the login / invite pages and on report cards.
 *  Storage policies (migration 0003) let anyone read a logo, but only
 *  the platform owner or that school's own school_admin may upload,
 *  replace or delete it.
 */

export const LOGO_BUCKET = "school-logos";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_ACCEPT_ATTR = "image/png,image/jpeg,image/webp";

export type SchoolBranding = {
  name: string;
  motto: string | null;
  logo_url: string | null;
};

/** Human-readable reason a file cannot be used as a logo, or null if OK. */
export function validateLogoFile(file: File): string | null {
  if (!LOGO_MIME_TYPES.includes(file.type as (typeof LOGO_MIME_TYPES)[number])) {
    return "Choose a PNG, JPG or WebP image.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "Logo must be 2 MB or smaller.";
  }
  return null;
}

/** Upload (or replace) a school's logo. Returns the public URL on success. */
export async function uploadSchoolLogo(
  schoolId: string,
  file: File,
): Promise<{ url?: string; error?: string }> {
  const problem = validateLogoFile(file);
  if (problem) return { error: problem };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${schoolId}/logo.${ext}`;

  // Remove a previous logo saved with a different extension, so the
  // bucket keeps exactly one logo per school.
  const { data: existing } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(schoolId);
  const stale = (existing ?? [])
    .filter((f) => f.name.startsWith("logo.") && f.name !== `logo.${ext}`)
    .map((f) => `${schoolId}/${f.name}`);
  if (stale.length > 0) {
    await supabase.storage.from(LOGO_BUCKET).remove(stale);
  }

  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: `Could not upload logo: ${uploadError.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);

  const { error: saveError } = await supabase
    .from("schools")
    .update({ logo_url: publicUrl })
    .eq("id", schoolId);
  if (saveError) return { error: `Logo uploaded but could not be saved: ${saveError.message}` };

  return { url: publicUrl };
}

/** Delete a school's logo file and clear `schools.logo_url`. */
export async function removeSchoolLogo(
  schoolId: string,
): Promise<{ error?: string }> {
  const { data: existing } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(schoolId);
  const paths = (existing ?? [])
    .filter((f) => f.name.startsWith("logo."))
    .map((f) => `${schoolId}/${f.name}`);
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(LOGO_BUCKET).remove(paths);
    if (error) return { error: `Could not delete logo file: ${error.message}` };
  }
  const { error } = await supabase
    .from("schools")
    .update({ logo_url: null })
    .eq("id", schoolId);
  if (error) return { error: `Could not clear logo: ${error.message}` };
  return {};
}

/** Public branding (name / motto / logo) for a school, usable before
 *  sign-in on the login and invite-accept pages. Backed by the
 *  `school_branding()` function from migration 0003. */
export async function fetchSchoolBranding(
  schoolId: string,
): Promise<SchoolBranding | null> {
  const { data, error } = await supabase.rpc("school_branding", {
    p_school_id: schoolId,
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? (row as SchoolBranding) : null;
}

/** Initials shown when a school has no logo yet, e.g. "GA". */
export function schoolInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
