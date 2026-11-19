"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type { ClassRow, School, Student } from "@/lib/types";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

export default function Students() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const base = useWorkspaceBase();
  const canManage = useCanManage();
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [search, setSearch] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [classId, setClassId] = useState("");
  const [msg, setMsg] = useState("");
  const [year, setYear] = useState(2026);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  const load = async () => {
    const { data: s } = schoolId
      ? await supabase.from("schools").select("*").eq("id", schoolId).single()
      : await supabase.from("schools").select("*").order("created_at").limit(1).single();
    if (!s) return;
    setSchool(s);
    const { data: st } = await supabase.from("students").select("*").eq("school_id", s.id).order("created_at");
    setStudents(st ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", s.id).order("name");
    setClasses(c ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const nextAdmissionNo = () => {
    return `DSV/${year}/${String(students.length + 1).padStart(4, "0")}`;
  };

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !firstName.trim() || !lastName.trim()) return;
    const admissionNo = nextAdmissionNo();
    const cls = classes.find((c) => c.id === classId);
    const { error } = await supabase.from("students").insert({
      school_id: school.id,
      branch_id: cls?.branch_id ?? null,
      class_id: classId || null,
      admission_no: admissionNo,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      gender: gender || null,
    });
    setMsg(error ? `Could not add pupil: ${error.message}` : `${firstName.trim()} ${lastName.trim()} added — ${admissionNo}.`);
    setFirstName(""); setLastName(""); setGender("");
    load();
  };

  const classNameOf = (id: string | null) =>
    classes.find((c) => c.id === id)?.name ?? "—";
  const filtered = students.filter((s) =>
    `${s.first_name} ${s.last_name} ${s.admission_no}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Students" sub="Searchable register. Admission numbers are generated automatically — DSV/2026/0001, 0002…" />
      {readOnly && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile?.role.replace("_", " ")} — read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">Add a pupil</h2>
          <form onSubmit={addStudent} className="space-y-3">
            <div><label className={labelCls}>First name</label><input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div><label className={labelCls}>Last name</label><input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div><label className={labelCls}>Gender</label>
              <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option><option>Female</option><option>Male</option>
              </select></div>
            <div><label className={labelCls}>Class</label>
              <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">— No class yet —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <p className="text-xs text-slate-400">Next admission number: {nextAdmissionNo()}</p>
            <button className={btnCls} disabled={!isSupabaseConfigured || readOnly}>Add pupil</button>
          </form>
        </Card>
        <div className="md:col-span-2">
          <Card>
            <input className={`${inputCls} mb-3`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or admission number…" />
            <ul className="space-y-2 text-sm">
              {filtered.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
                  <span><strong>{s.first_name} {s.last_name}</strong> · {classNameOf(s.class_id)}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Link href={`${base}/students/${s.id}/report-card`} className="font-semibold text-royal">Report card →</Link>
                    <span className="font-mono text-xs text-slate-500">{s.admission_no}</span>
                  </span>
                </li>
              ))}
              {filtered.length === 0 && <li className="text-slate-400">No pupils yet — add the first one.</li>}
            </ul>
            <p className="mt-3 text-xs text-slate-400">{students.length} pupil(s) on roll.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
