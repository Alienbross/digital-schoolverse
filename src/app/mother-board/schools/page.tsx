"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { createInvite, inviteLink } from "@/lib/invites";
import { schoolPath, slugify, slugProblem } from "@/lib/slug";
import type { School } from "@/lib/types";
import { schoolCounts } from "@/lib/mother-board";
import { SchoolLogo } from "@/components/school-logo";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";

type Counts = { students: number; teachers: number; parents: number; openComplaints: number };

export default function MotherBoardSchools() {
  const { user } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState("Basics");
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  // Inline slug editing per school: slug text being edited, by school id.
  const [editSlug, setEditSlug] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard unavailable — the link text is visible to copy by hand */
    }
  };

  const schoolUrl = (s: School) =>
    s.slug ? `${window.location.origin}${schoolPath(s.slug)}` : "";

  const load = async () => {
    const { data } = await supabase.from("schools").select("*").order("created_at");
    const list = (data as School[]) ?? [];
    setSchools(list);
    const next: Record<string, Counts> = {};
    for (const s of list) next[s.id] = await schoolCounts(s.id);
    setCounts(next);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const cleanSlug = slugify(slug.trim() || name);
    const problem = slugProblem(cleanSlug);
    if (problem) {
      setMsg(`Could not create school: ${problem}`);
      return;
    }
    setBusy(true);
    setMsg("");
    setInviteUrl("");
    const { data, error } = await supabase
      .from("schools")
      .insert({
        name: name.trim(),
        slug: cleanSlug,
        email: email.trim() || null,
        phone: phone.trim() || null,
        plan,
        status: "Trial",
      })
      .select("*")
      .single();
    if (error || !data) {
      const taken =
        (error as { code?: string } | null)?.code === "23505" ||
        (error?.message ?? "").toLowerCase().includes("duplicate");
      setMsg(
        taken
          ? `Could not create school: the short name "${cleanSlug}" is already taken — try another.`
          : `Could not create school: ${error?.message ?? "unknown error"}`,
      );
      setBusy(false);
      return;
    }
    const school = data as School;
    let note = `School ${school.name} created (Trial, ${plan}) — its address is ${schoolPath(school.slug)}.`;
    if (adminEmail.trim()) {
      const res = await createInvite({
        email: adminEmail.trim(),
        role: "school_admin",
        schoolId: school.id,
        schoolName: school.name,
        createdBy: user?.id ?? null,
      });
      if (res.invite) {
        setInviteUrl(inviteLink(res.invite.token, school.slug));
        note += " Admin invite created — share the link below.";
      } else {
        note += ` But the admin invite failed: ${res.error}`;
      }
    }
    setMsg(note);
    setName(""); setSlug(""); setSlugTouched(false); setEmail(""); setPhone(""); setAdminEmail("");
    setBusy(false);
    load();
  };

  const saveSlug = async (s: School) => {
    const cleanSlug = slugify((editSlug[s.id] ?? s.slug ?? "").trim());
    const problem = slugProblem(cleanSlug);
    if (problem) {
      setMsg(`Could not save short name: ${problem}`);
      return;
    }
    const { error } = await supabase
      .from("schools")
      .update({ slug: cleanSlug })
      .eq("id", s.id);
    if (error) {
      const taken =
        (error as { code?: string } | null)?.code === "23505" ||
        (error.message ?? "").toLowerCase().includes("duplicate");
      setMsg(
        taken
          ? `Could not save short name: "${cleanSlug}" is already taken — try another.`
          : `Could not save short name: ${error.message}`,
      );
      return;
    }
    setMsg(`${s.name} now lives at ${schoolPath(cleanSlug)}.`);
    setEditSlug((prev) => {
      const next = { ...prev };
      delete next[s.id];
      return next;
    });
    load();
  };

  const setStatus = async (s: School, status: string) => {
    const { error } = await supabase.from("schools").update({ status }).eq("id", s.id);
    setMsg(error ? `Could not update: ${error.message}` : `${s.name} is now ${status}.`);
    load();
  };

  const changePlan = async (s: School, planValue: string) => {
    const { error } = await supabase.from("schools").update({ plan: planValue }).eq("id", s.id);
    setMsg(error ? `Could not update: ${error.message}` : `${s.name} is now on ${planValue}.`);
    load();
  };

  const deleteSchool = async (s: School) => {
    if (!window.confirm(`Delete ${s.name} and ALL of its data (students, teachers, fees, everything)? This cannot be undone.`)) return;
    const { error } = await supabase.from("schools").delete().eq("id", s.id);
    setMsg(error ? `Could not delete: ${error.message}` : `${s.name} deleted.`);
    load();
  };

  return (
    <div>
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      {inviteUrl && (
        <Card>
          <h2 className="mb-2 font-semibold">Admin invite link — share it with the school admin</h2>
          <p className="mb-2 break-all rounded-lg bg-mist px-3 py-2 font-mono text-xs">{inviteUrl}</p>
          <p className="text-xs text-slate-500">
            No email is sent yet — copy this link and send it yourself (email, WhatsApp, SMS). Live email sending plugs in later.
          </p>
          <button
            className="mt-2 text-sm font-semibold text-royal"
            onClick={() => navigator.clipboard?.writeText(inviteUrl)}
          >
            Copy link
          </button>
        </Card>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">Create a school</h2>
          <form onSubmit={createSchool} className="space-y-3">
            <div><label className={labelCls}>School name</label><input className={inputCls} value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} placeholder="e.g. Greenfield Academy" /></div>
            <div><label className={labelCls}>Short name (its web address)</label>
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-xs text-slate-400">…/ </span>
                <input className={inputCls} value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} placeholder="greenfield" />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Lowercase letters, numbers and hyphens only. This is the
                school&apos;s address: {slug ? schoolPath(slugify(slug) || "greenfield") : "/greenfield"} — suggested from the name, change it if you like.
              </p>
            </div>
            <div><label className={labelCls}>School email</label><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className={labelCls}>School phone</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><label className={labelCls}>Plan</label>
              <select className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option>Basics</option><option>Advanced</option>
              </select></div>
            <div><label className={labelCls}>School admin email (optional — creates their invite now)</label><input className={inputCls} type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@school.com" /></div>
            <button className={btnCls} disabled={busy}>Create school</button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            New schools start on Trial. The admin accepts the invite, sets a
            password, and logs in to set up their school.
          </p>
        </Card>

        <div className="md:col-span-2">
          <Card>
            <h2 className="mb-3 font-semibold">All schools ({schools.length})</h2>
            <ul className="space-y-3 text-sm">
              {schools.map((s) => {
                const c = counts[s.id];
                return (
                  <li key={s.id} className="rounded-lg bg-mist px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <SchoolLogo name={s.name} logoUrl={s.logo_url} size={32} />
                        <span>
                          <strong>{s.name}</strong>{" "}
                          <span className="text-xs text-slate-500">{s.plan} · {s.status}</span>
                        </span>
                      </span>
                      <Link href={`/mother-board/schools/${s.id}`} className="shrink-0 font-semibold text-royal">
                        Control →
                      </Link>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {c ? `${c.students} pupils · ${c.teachers} teachers · ${c.parents} parents · ${c.openComplaints} open complaints` : "…"}
                      {s.email ? ` · ${s.email}` : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {s.slug ? (
                        <>
                          <Link href={schoolPath(s.slug)} className="break-all font-mono font-semibold text-royal">
                            {schoolUrl(s).replace(/^https?:\/\//, "")}
                          </Link>
                          <button
                            className="font-semibold text-royal"
                            onClick={() => copyText(schoolUrl(s), `url-${s.id}`)}
                          >
                            {copied === `url-${s.id}` ? "Copied ✓" : "Copy link"}
                          </button>
                          <Link href={schoolPath(s.slug)} className="font-semibold text-royal">
                            Open portal →
                          </Link>
                        </>
                      ) : (
                        <span className="text-slate-400">No web address yet — set a short name below.</span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <label className="text-slate-500">Short name</label>
                      <input
                        className="w-40 rounded border border-line bg-white px-2 py-1"
                        value={editSlug[s.id] ?? s.slug ?? ""}
                        onChange={(e) => setEditSlug((prev) => ({ ...prev, [s.id]: e.target.value.toLowerCase() }))}
                        placeholder="greenfield"
                      />
                      <button className="font-semibold text-royal" onClick={() => saveSlug(s)}>
                        Save short name
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <label className="text-slate-500">Plan</label>
                      <select
                        className="rounded border border-line bg-white px-2 py-1"
                        value={s.plan}
                        onChange={(e) => changePlan(s, e.target.value)}
                      >
                        <option>Basics</option><option>Advanced</option>
                      </select>
                      {s.status === "Suspended" ? (
                        <button className="font-semibold text-green-700" onClick={() => setStatus(s, "Active")}>
                          Unsuspend
                        </button>
                      ) : (
                        <button className="font-semibold text-amber-700" onClick={() => setStatus(s, "Suspended")}>
                          Suspend
                        </button>
                      )}
                      <button className="font-semibold text-red-600" onClick={() => deleteSchool(s)}>
                        Delete school
                      </button>
                    </div>
                  </li>
                );
              })}
              {schools.length === 0 && <li className="text-slate-400">No schools yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
