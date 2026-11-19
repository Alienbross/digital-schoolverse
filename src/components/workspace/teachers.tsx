"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import type { School, Teacher } from "@/lib/types";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

export default function Teachers() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("Teacher");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data: s } = schoolId
      ? await supabase.from("schools").select("*").eq("id", schoolId).single()
      : await supabase.from("schools").select("*").order("created_at").limit(1).single();
    if (!s) return;
    setSchool(s);
    const { data: t } = await supabase.from("teachers").select("*").eq("school_id", s.id).order("last_name");
    setTeachers(t ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !firstName.trim() || !lastName.trim()) return;
    const { error } = await supabase.from("teachers").insert({
      school_id: school.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role,
      email: email.trim() || null,
      phone: phone.trim() || null,
    });
    setMsg(error ? `Could not add: ${error.message}` : `${firstName.trim()} ${lastName.trim()} added as ${role}.`);
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    load();
  };

  const toggleSenior = async (t: Teacher, value: boolean) => {
    const { error } = await supabase
      .from("teachers")
      .update({ can_approve_parents: value })
      .eq("id", t.id);
    setMsg(
      error
        ? `Could not change: ${error.message}`
        : value
          ? `${t.first_name} ${t.last_name} is now senior staff and can approve parent registrations.`
          : `${t.first_name} ${t.last_name} can no longer approve parent registrations.`,
    );
    if (!error) load();
  };

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Teachers & Staff" sub="Teachers and other staff in one register." />
      {readOnly && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile?.role.replace("_", " ")} - read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Add a teacher / staff member</h2>
          <form onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>First name</label><input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div><label className={labelCls}>Last name</label><input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </div>
            <div><label className={labelCls}>Role</label>
              <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
                <option>Teacher</option><option>Staff</option>
              </select></div>
            <div><label className={labelCls}>Email</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <button className={btnCls} disabled={!isSupabaseConfigured || readOnly}>Add</button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Register ({teachers.length})</h2>
          <p className="mb-3 text-sm text-slate-500">
            Senior staff can approve parent registrations (and see pending
            parents in their workspace). The school admin approves teachers
            and can approve anyone.
          </p>
          <ul className="space-y-2 text-sm">
            {teachers.map((t) => (
              <li key={t.id} className="rounded-lg bg-mist px-3 py-2">
                <strong>{t.first_name} {t.last_name}</strong> · {t.role}
                <span className="block text-xs text-slate-500">{t.email ?? "-"} · {t.phone ?? "-"}</span>
                <label className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!t.can_approve_parents}
                    disabled={readOnly}
                    onChange={(e) => toggleSenior(t, e.target.checked)}
                  />
                  Senior staff - can approve parent registrations
                </label>
              </li>
            ))}
            {teachers.length === 0 && <li className="text-slate-400">Nobody yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
