"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Branch, ClassRow, School, Teacher } from "@/lib/types";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

export default function Classes() {
  const [school, setSchool] = useState<School | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [name, setName] = useState("");
  const [stage, setStage] = useState("Primary");
  const [arm, setArm] = useState("");
  const [capacity, setCapacity] = useState("");
  const [branchId, setBranchId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data: s } = await supabase.from("schools").select("*").order("created_at").limit(1).single();
    if (!s) return;
    setSchool(s);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", s.id).order("name");
    setClasses(c ?? []);
    const { data: b } = await supabase.from("branches").select("*").eq("school_id", s.id).order("created_at");
    setBranches(b ?? []);
    const { data: t } = await supabase.from("teachers").select("*").eq("school_id", s.id).order("last_name");
    setTeachers(t ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !name.trim()) return;
    const { error } = await supabase.from("classes").insert({
      school_id: school.id,
      branch_id: branchId || null,
      name: name.trim(),
      stage,
      arm: arm.trim() || null,
      capacity: capacity ? Number(capacity) : null,
      class_teacher_id: teacherId || null,
    });
    setMsg(error ? `Could not add class: ${error.message}` : `Class ${name.trim()} added.`);
    setName(""); setArm(""); setCapacity("");
    load();
  };

  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !branchName.trim()) return;
    const { error } = await supabase.from("branches").insert({
      school_id: school.id,
      name: branchName.trim(),
      is_main: branches.length === 0,
    });
    setMsg(error ? `Could not add branch: ${error.message}` : `Branch ${branchName.trim()} added.`);
    setBranchName("");
    load();
  };

  const branchNameOf = (id: string | null) =>
    branches.find((b) => b.id === id)?.name ?? "Main branch";
  const teacherNameOf = (id: string | null) => {
    const t = teachers.find((x) => x.id === id);
    return t ? `${t.first_name} ${t.last_name}` : "—";
  };

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Classes & Arms" sub="Stages, capacity and class teachers. Classes belong to a branch — everything saved before branches stays on Main." />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Add a class</h2>
          <form onSubmit={addClass} className="space-y-3">
            <div><label className={labelCls}>Class name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary 3B" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Stage</label>
                <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option>Primary</option><option>Secondary</option>
                </select></div>
              <div><label className={labelCls}>Arm</label><input className={inputCls} value={arm} onChange={(e) => setArm(e.target.value)} placeholder="B" /></div>
            </div>
            <div><label className={labelCls}>Capacity</label><input className={inputCls} type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
            <div><label className={labelCls}>Branch</label>
              <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Main branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Class teacher</label>
              <select className={inputCls} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">— None yet —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select></div>
            <button className={btnCls} disabled={!isSupabaseConfigured}>Add class</button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">Branches</h2>
            <form onSubmit={addBranch} className="mb-3 flex gap-2">
              <input className={inputCls} value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. Lekki Campus" />
              <button className={btnCls} disabled={!isSupabaseConfigured}>Add</button>
            </form>
            <ul className="space-y-1 text-sm">
              {branches.map((b) => <li key={b.id}>{b.name} {b.is_main && <span className="text-xs text-slate-400">(Main)</span>}</li>)}
              {branches.length === 0 && <li className="text-slate-400">No branches yet — classes use Main branch.</li>}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Classes ({classes.length})</h2>
            <ul className="space-y-2 text-sm">
              {classes.map((c) => (
                <li key={c.id} className="rounded-lg bg-mist px-3 py-2">
                  <strong>{c.name}</strong> · {c.stage}
                  <span className="block text-xs text-slate-500">
                    {branchNameOf(c.branch_id)} · Teacher: {teacherNameOf(c.class_teacher_id)}
                    {c.capacity ? ` · Capacity ${c.capacity}` : ""}
                  </span>
                </li>
              ))}
              {classes.length === 0 && <li className="text-slate-400">No classes yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
