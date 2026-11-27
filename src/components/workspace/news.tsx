"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { btnCls, Card, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  LOGO_ACCEPT_ATTR,
  NEWS_AUDIENCE_LABELS,
  createNews,
  deleteNews,
  fetchAllNews,
  fetchNewsForUser,
  uploadNewsImage,
  type NewsAudience,
  type SchoolNewsItem,
} from "@/lib/news";

type ClassOption = { id: string; name: string; arm: string | null };

/** Page wrapper: picks admin mode for the school admin and the
 *  platform owner, view mode for everyone else. Used by both the
 *  /news page and the /<school-slug>/news page. */
export function NewsPage() {
  const { schoolId, profile } = useAuth();
  const mode =
    profile?.role === "school_admin" || profile?.role === "platform_owner"
      ? "admin"
      : "view";
  return <NewsSection schoolId={schoolId ?? ""} mode={mode} />;
}

/** School news - the school news / advert column. Admin mode posts
 *  news and manages what was posted; view mode shows each person
 *  only the news meant for them, newest first. */
export default function NewsSection({
  schoolId,
  mode,
}: {
  schoolId: string;
  mode: "admin" | "view";
}) {
  const { profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<SchoolNewsItem[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<NewsAudience>("everybody");
  const [pickedClasses, setPickedClasses] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    if (!schoolId) return;
    if (mode === "admin") {
      setItems(await fetchAllNews(schoolId));
      const { data: c } = await supabase
        .from("classes")
        .select("id, name, arm")
        .eq("school_id", schoolId)
        .order("name");
      setClasses((c as ClassOption[] | null) ?? []);
      return;
    }
    // View mode: a parent needs their children's classes to match
    // parents_of_classes news.
    let childIds: string[] = [];
    if (profile?.role === "parent" && profile.parent_id) {
      const { data: links } = await supabase
        .from("parent_children")
        .select("student_id")
        .eq("parent_id", profile.parent_id)
        .eq("status", "Approved");
      const studentIds = ((links as { student_id: string }[] | null) ?? []).map(
        (l) => l.student_id,
      );
      if (studentIds.length > 0) {
        const { data: pupils } = await supabase
          .from("students")
          .select("id, class_id")
          .in("id", studentIds);
        childIds = [
          ...new Set(
            ((pupils as { class_id: string | null }[] | null) ?? [])
              .map((p) => p.class_id)
              .filter((c): c is string => !!c),
          ),
        ];
      }
    }
    setItems(await fetchNewsForUser(schoolId, profile, childIds));
  };

  useEffect(() => {
    if (!authLoading && schoolId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId, mode, profile?.role, profile?.parent_id]);

  const toggleClass = (id: string) => {
    setPickedClasses((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const postNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setMsg("Title and body are required.");
      return;
    }
    setSaving(true);
    setMsg("");
    let imageUrl: string | null = null;
    if (file) {
      const up = await uploadNewsImage(schoolId, file);
      if (up.error || !up.url) {
        setMsg(up.error ?? "Could not upload picture.");
        setSaving(false);
        return;
      }
      imageUrl = up.url;
    }
    const res = await createNews({
      schoolId,
      createdBy: profile?.id ?? null,
      title,
      body,
      imageUrl,
      audience,
      classIds: pickedClasses,
    });
    setSaving(false);
    if (!res.ok) {
      setMsg(res.error ?? "Could not post news.");
      return;
    }
    setTitle("");
    setBody("");
    setAudience("everybody");
    setPickedClasses([]);
    setFile(null);
    setMsg(
      res.notifyError
        ? `News posted, but notifications could not be sent: ${res.notifyError}`
        : "News posted.",
    );
    load();
  };

  const removeNews = async (item: SchoolNewsItem) => {
    if (!window.confirm(`Delete this news post: "${item.title}"?`)) return;
    setDeletingId(item.id);
    const res = await deleteNews(item);
    setDeletingId(null);
    if (!res.ok) {
      setMsg(res.error ?? "Could not delete news.");
      return;
    }
    setMsg("News deleted.");
    load();
  };

  const audienceNote = (item: SchoolNewsItem) => {
    if (item.audience_type === "parents_of_classes") {
      const names = (item.class_ids ?? [])
        .map((id) => {
          const c = classes.find((x) => x.id === id);
          return c ? `${c.name}${c.arm ? ` ${c.arm}` : ""}` : null;
        })
        .filter(Boolean);
      return names.length > 0
        ? `Parents of ${names.join(", ")}`
        : "Parents of particular classes";
    }
    return NEWS_AUDIENCE_LABELS[item.audience_type];
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title="School news"
        sub="News and adverts from your school - posted by the school admin."
      />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}

      {mode === "admin" && (
        <Card>
          <h2 className="mb-3 font-semibold">Post news</h2>
          <form onSubmit={postNews} className="space-y-3">
            <div>
              <label className={labelCls}>Title</label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Inter-house sports day"
              />
            </div>
            <div>
              <label className={labelCls}>Body</label>
              <textarea
                className={inputCls}
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the news here."
              />
            </div>
            <div>
              <label className={labelCls}>Picture (optional)</label>
              <input
                type="file"
                accept={LOGO_ACCEPT_ATTR}
                className={inputCls}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-slate-500">
                PNG, JPG or WebP, 2 MB or smaller.
              </p>
            </div>
            <div>
              <label className={labelCls}>Who should see it</label>
              <select
                className={inputCls}
                value={audience}
                onChange={(e) => setAudience(e.target.value as NewsAudience)}
              >
                {(Object.keys(NEWS_AUDIENCE_LABELS) as NewsAudience[]).map((a) => (
                  <option key={a} value={a}>
                    {NEWS_AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
            {audience === "parents_of_classes" && (
              <div>
                <label className={labelCls}>Classes</label>
                {classes.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No classes yet - add classes in School Setup first.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => (
                    <label
                      key={c.id}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                        pickedClasses.includes(c.id)
                          ? "border-royal bg-sky-50 font-semibold text-royal"
                          : "border-line bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={pickedClasses.includes(c.id)}
                        onChange={() => toggleClass(c.id)}
                      />
                      {c.name}
                      {c.arm ? ` ${c.arm}` : ""}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button className={btnCls} disabled={saving}>
              {saving ? "Posting…" : "Post news"}
            </button>
          </form>
        </Card>
      )}

      <div className="mt-6">
        <h2 className="mb-3 font-semibold">
          {mode === "admin" ? "Posted news" : "Latest news"}
        </h2>
        {items.length === 0 && (
          <p className="text-sm text-slate-500">No news yet.</p>
        )}
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                {item.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt=""
                    className="mb-3 max-h-64 w-full rounded-lg object-cover"
                  />
                )}
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {new Date(item.created_at).toLocaleDateString()} ·{" "}
                  {mode === "admin" ? audienceNote(item) : "Posted by your school"}
                </p>
                {mode === "admin" && (
                  <button
                    className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    onClick={() => removeNews(item)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
