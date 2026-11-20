"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import type { ClassRow, Parent, ParentChild, School, Student } from "@/lib/types";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

export default function Parents() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<ParentChild[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [linkParent, setLinkParent] = useState("");
  const [linkStudent, setLinkStudent] = useState("");
  const [relationship, setRelationship] = useState("Mother");
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [childClassFilter, setChildClassFilter] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);

  const load = async () => {
    const { data: s } = schoolId
      ? await supabase.from("schools").select("*").eq("id", schoolId).single()
      : await supabase.from("schools").select("*").order("created_at").limit(1).single();
    if (!s) return;
    setSchool(s);
    const { data: p } = await supabase.from("parents").select("*").eq("school_id", s.id).order("last_name");
    setParents(p ?? []);
    const { data: st } = await supabase.from("students").select("*").eq("school_id", s.id).order("last_name");
    setStudents(st ?? []);
    const parentIds = (p ?? []).map((x) => x.id);
    const { data: l } = parentIds.length
      ? await supabase.from("parent_children").select("*").in("parent_id", parentIds)
      : { data: [] as ParentChild[] };
    setLinks(l ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", s.id).order("name");
    setClasses(c ?? []);
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !firstName.trim() || !lastName.trim()) return;
    const { error } = await supabase.from("parents").insert({
      school_id: school.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    setMsg(error ? `Could not add parent: ${error.message}` : "Parent added.");
    setFirstName(""); setLastName(""); setPhone(""); setEmail("");
    load();
  };

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkParent || !linkStudent) {
      setMsg("Pick a parent and a child to link.");
      return;
    }
    const { error } = await supabase.from("parent_children").insert({
      parent_id: linkParent,
      student_id: linkStudent,
      relationship,
    });
    setMsg(error ? `Could not link: ${error.message}` : "Parent linked to child.");
    load();
  };

  const childrenOf = (parentId: string) =>
    links
      .filter((l) => l.parent_id === parentId)
      .map((l) => {
        const s = students.find((x) => x.id === l.student_id);
        return s ? `${s.first_name} ${s.last_name} (${l.relationship ?? "Parent"})` : null;
      })
      .filter(Boolean);

  const filteredParents = parents.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${p.first_name} ${p.last_name} ${p.phone ?? ""} ${p.email ?? ""} ${childrenOf(p.id).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (childClassFilter) {
      const childIds = links.filter((l) => l.parent_id === p.id).map((l) => l.student_id);
      const hasChildInClass = students.some(
        (s) => childIds.includes(s.id) && s.class_id === childClassFilter,
      );
      if (!hasChildInClass) return false;
    }
    return true;
  });

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Parents" sub="Parents, linked to their children - siblings share one parent record." />
      {readOnly && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile?.role.replace("_", " ")} - read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">Add a parent</h2>
            <form onSubmit={add} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>First name</label><input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                <div><label className={labelCls}>Last name</label><input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
              </div>
              <div><label className={labelCls}>Phone</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><label className={labelCls}>Email</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <button className={btnCls} disabled={!isSupabaseConfigured || readOnly}>Add parent</button>
            </form>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Link parent to child</h2>
            <form onSubmit={link} className="space-y-3">
              <div><label className={labelCls}>Parent</label>
                <select className={inputCls} value={linkParent} onChange={(e) => setLinkParent(e.target.value)}>
                  <option value="">- Pick a parent -</option>
                  {parents.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select></div>
              <div><label className={labelCls}>Child</label>
                <select className={inputCls} value={linkStudent} onChange={(e) => setLinkStudent(e.target.value)}>
                  <option value="">- Pick a pupil -</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.admission_no})</option>)}
                </select></div>
              <div><label className={labelCls}>Relationship</label>
                <select className={inputCls} value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                  <option>Mother</option><option>Father</option><option>Guardian</option>
                </select></div>
              <button className={btnCls} disabled={!isSupabaseConfigured || readOnly}>Link</button>
            </form>
          </Card>
        </div>
        <Card>
          <h2 className="mb-3 font-semibold">Parents ({filteredParents.length} of {parents.length})</h2>
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone, email or child…" />
            <select className={inputCls} value={childClassFilter} onChange={(e) => setChildClassFilter(e.target.value)}>
              <option value="">All classes (child)</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <ul className="space-y-2 text-sm">
            {filteredParents.map((p) => (
              <li key={p.id} className="rounded-lg bg-mist px-3 py-2">
                <strong>{p.first_name} {p.last_name}</strong> · {p.phone ?? "no phone"}
                <span className="block text-xs text-slate-500">
                  Children: {childrenOf(p.id).join(", ") || "none linked yet"}
                </span>
              </li>
            ))}
            {filteredParents.length === 0 && <li className="text-slate-400">No parents match these filters.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
