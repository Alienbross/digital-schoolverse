"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { LogoUploadField } from "@/components/school-logo";
import type { School, Term } from "@/lib/types";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

export default function Setup() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  // No profile yet (Supabase not configured / not signed in) means the
  // old pilot behaviour; a signed-in teacher/student/parent is read-only.
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [session, setSession] = useState("2026/2027");
  const [termName, setTermName] = useState("First Term");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const schoolQuery = schoolId
      ? supabase.from("schools").select("*").eq("id", schoolId).single()
      : supabase
          .from("schools")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
    const { data: s } = await schoolQuery;
    if (s) {
      setSchool(s);
      setName(s.name);
      setMotto(s.motto ?? "");
      setEmail(s.email ?? "");
      setPhone(s.phone ?? "");
      setLogoUrl(s.logo_url ?? null);
    }
    let termsQuery = supabase.from("terms").select("*").order("created_at", { ascending: true });
    if (schoolId) termsQuery = termsQuery.eq("school_id", schoolId);
    else if (s) termsQuery = termsQuery.eq("school_id", s.id);
    const { data: t } = await termsQuery;
    setTerms(t ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const saveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMsg("");
    const payload = { name: name.trim(), motto: motto.trim() || null, email: email.trim() || null, phone: phone.trim() || null };
    const { error } = school
      ? await supabase.from("schools").update(payload).eq("id", school.id)
      : await supabase.from("schools").insert(payload);
    setMsg(error ? `Could not save: ${error.message}` : "School profile saved.");
    setBusy(false);
    load();
  };

  const addTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) {
      setMsg("Save the school profile first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("terms").insert({
      school_id: school.id,
      session: session.trim(),
      name: termName.trim(),
      is_current: terms.length === 0,
    });
    setMsg(error ? `Could not add term: ${error.message}` : "Term added.");
    setBusy(false);
    load();
  };

  const setCurrent = async (id: string) => {
    if (!school) return;
    await supabase.from("terms").update({ is_current: false }).eq("school_id", school.id);
    await supabase.from("terms").update({ is_current: true }).eq("id", id);
    load();
  };

  // Registration phases (migration 0006): open teachers, then
  // students, then parents — or all three at once.
  const togglePhase = async (
    role: "teacher" | "student" | "parent",
    open: boolean,
  ) => {
    if (!school) return;
    setBusy(true);
    const { error } = await supabase
      .from("schools")
      .update({ [`reg_${role}_open`]: open })
      .eq("id", school.id);
    setMsg(
      error
        ? `Could not change: ${error.message}`
        : `${role[0].toUpperCase() + role.slice(1)} registration ${open ? "opened" : "closed"}.`,
    );
    setBusy(false);
    load();
  };

  const openAllPhases = async () => {
    if (!school) return;
    setBusy(true);
    const { error } = await supabase
      .from("schools")
      .update({ reg_teacher_open: true, reg_student_open: true, reg_parent_open: true })
      .eq("id", school.id);
    setMsg(error ? `Could not change: ${error.message}` : "All three registration phases opened.");
    setBusy(false);
    load();
  };

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="School Setup" sub="School profile, sessions and terms." />
      {profile && !canManage && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile.role.replace("_", " ")} — read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Registration phases</h2>
          <p className="mb-3 text-sm text-slate-500">
            Open registration in order — teachers first, then students, then
            parents — so pupils exist before parents link them. You can also
            open all three at once. A closed phase shows “not open yet” on
            its register page at{" "}
            <span className="font-semibold text-ink">
              /{school?.slug ?? "your-school"}/register
            </span>
            .
          </p>
          {school ? (
            <div className="space-y-2">
              {(["teacher", "student", "parent"] as const).map((role) => {
                const key = `reg_${role}_open` as const;
                const open = !!school[key];
                return (
                  <div key={role} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2 text-sm">
                    <span>
                      <strong className="capitalize">{role}</strong> registration{" "}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${open ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                        {open ? "Open" : "Closed"}
                      </span>
                    </span>
                    <button
                      className="font-semibold text-royal"
                      disabled={busy || readOnly}
                      onClick={() => togglePhase(role, !open)}
                    >
                      {open ? "Close" : "Open"}
                    </button>
                  </div>
                );
              })}
              <button
                className="mt-1 rounded-lg border border-line px-4 py-2 text-sm font-semibold"
                disabled={busy || readOnly}
                onClick={openAllPhases}
              >
                Open all three phases
              </button>
              <p className="text-xs text-slate-400">
                Pending accounts are decided under Registration &amp; Approvals
                in the sidebar.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Save the school profile first.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">School profile</h2>
          {school ? (
            <div className="mb-4">
              <LogoUploadField
                schoolId={school.id}
                schoolName={school.name}
                currentUrl={logoUrl}
                disabled={readOnly}
                onChanged={(url) => {
                  setLogoUrl(url);
                  load();
                }}
              />
            </div>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              Save the school profile first, then you can upload the logo.
            </p>
          )}
          <form onSubmit={saveSchool} className="space-y-3">
            <div><label className={labelCls}>School name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greenfield Academy" /></div>
            <div><label className={labelCls}>Motto</label><input className={inputCls} value={motto} onChange={(e) => setMotto(e.target.value)} /></div>
            <div><label className={labelCls}>Email</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <button className={btnCls} disabled={busy || !isSupabaseConfigured || readOnly}>Save school</button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Sessions &amp; terms</h2>
          <form onSubmit={addTerm} className="mb-4 flex gap-2">
            <input className={inputCls} value={session} onChange={(e) => setSession(e.target.value)} placeholder="2026/2027" />
            <input className={inputCls} value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="First Term" />
            <button className={btnCls} disabled={busy || !isSupabaseConfigured || readOnly}>Add</button>
          </form>
          <ul className="space-y-2 text-sm">
            {terms.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                <span>{t.session} — {t.name} {t.is_current && <span className="ml-1 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Current</span>}</span>
                {!t.is_current && (
                  <button className="font-semibold text-royal" onClick={() => setCurrent(t.id)}>Set current</button>
                )}
              </li>
            ))}
            {terms.length === 0 && <li className="text-slate-400">No terms yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
