"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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
  const [school, setSchool] = useState<School | null>(null);
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
    const { data: s } = await supabase
      .from("schools")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    if (s) {
      setSchool(s);
      setName(s.name);
      setMotto(s.motto ?? "");
      setEmail(s.email ?? "");
      setPhone(s.phone ?? "");
    }
    const { data: t } = await supabase
      .from("terms")
      .select("*")
      .order("created_at", { ascending: true });
    setTerms(t ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="School Setup" sub="School profile, sessions and terms." />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">School profile</h2>
          <form onSubmit={saveSchool} className="space-y-3">
            <div><label className={labelCls}>School name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greenfield Academy" /></div>
            <div><label className={labelCls}>Motto</label><input className={inputCls} value={motto} onChange={(e) => setMotto(e.target.value)} /></div>
            <div><label className={labelCls}>Email</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <button className={btnCls} disabled={busy || !isSupabaseConfigured}>Save school</button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Sessions &amp; terms</h2>
          <form onSubmit={addTerm} className="mb-4 flex gap-2">
            <input className={inputCls} value={session} onChange={(e) => setSession(e.target.value)} placeholder="2026/2027" />
            <input className={inputCls} value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="First Term" />
            <button className={btnCls} disabled={busy || !isSupabaseConfigured}>Add</button>
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
