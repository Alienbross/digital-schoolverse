"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import type { ClassRow, ClassSubject, School, Subject, Teacher } from "@/lib/types";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

export default function Subjects() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assigned, setAssigned] = useState<ClassSubject[]>([]);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data: s } = schoolId
      ? await supabase.from("schools").select("*").eq("id", schoolId).single()
      : await supabase.from("schools").select("*").order("created_at").limit(1).single();
    if (!s) return;
    setSchool(s);
    const { data: sub } = await supabase.from("subjects").select("*").eq("school_id", s.id).order("name");
    setSubjects(sub ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", s.id).order("name");
    setClasses(c ?? []);
    const { data: t } = await supabase.from("teachers").select("*").eq("school_id", s.id).order("last_name");
    setTeachers(t ?? []);
    const classIds = (c ?? []).map((x) => x.id);
    const { data: a } = classIds.length
      ? await supabase.from("class_subjects").select("*").in("class_id", classIds)
      : { data: [] as ClassSubject[] };
    setAssigned(a ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !name.trim()) return;
    const { error } = await supabase.from("subjects").insert({ school_id: school.id, name: name.trim() });
    setMsg(error ? `Could not add subject: ${error.message}` : `Subject ${name.trim()} added.`);
    setName("");
    load();
  };

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !subjectId) {
      setMsg("Pick a class and a subject.");
      return;
    }
    const { error } = await supabase.from("class_subjects").insert({
      class_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId || null,
    });
    setMsg(error ? `Could not assign: ${error.message}` : "Subject assigned to class.");
    load();
  };

  const nameOf = (list: { id: string; name: string }[], id: string) =>
    list.find((x) => x.id === id)?.name ?? "?";
  const teacherNameOf = (id: string | null) => {
    const t = teachers.find((x) => x.id === id);
    return t ? `${t.first_name} ${t.last_name}` : "—";
  };

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Subjects" sub="Subjects, and which class takes each one — with its subject teacher." />
      {readOnly && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile?.role.replace("_", " ")} — read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Add a subject</h2>
          <form onSubmit={addSubject} className="mb-6 flex gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" />
            <button className={btnCls} disabled={!isSupabaseConfigured || readOnly}>Add</button>
          </form>
          <h2 className="mb-3 font-semibold">Assign to a class</h2>
          <form onSubmit={assign} className="space-y-3">
            <div><label className={labelCls}>Class</label>
              <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">— Pick a class —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Subject</label>
              <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">— Pick a subject —</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Subject teacher</label>
              <select className={inputCls} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">— None yet —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select></div>
            <button className={btnCls} disabled={!isSupabaseConfigured || readOnly}>Assign subject</button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">Subjects ({subjects.length})</h2>
            <ul className="space-y-1 text-sm">
              {subjects.map((s) => <li key={s.id}>{s.name}</li>)}
              {subjects.length === 0 && <li className="text-slate-400">No subjects yet.</li>}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Per-class assignments</h2>
            <ul className="space-y-2 text-sm">
              {assigned.map((a) => (
                <li key={a.id} className="rounded-lg bg-mist px-3 py-2">
                  {nameOf(classes, a.class_id)} — {nameOf(subjects, a.subject_id)}
                  <span className="block text-xs text-slate-500">Teacher: {teacherNameOf(a.teacher_id)}</span>
                </li>
              ))}
              {assigned.length === 0 && <li className="text-slate-400">Nothing assigned yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
