"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import type { ClassRow, Profile, School, Teacher, TeacherClassPick } from "@/lib/types";
import {
  TEACHER_PERMISSIONS,
  bulkStaffAction,
  type BulkStaffAction,
} from "@/lib/registration";
import {
  btnCls,
  Card,
  ConfigBanner,
  inputCls,
  labelCls,
  PageHeader,
} from "@/components/ui";

const STATUS_OPTIONS = ["Pending", "Active", "Suspended", "Rejected", "No login yet"];

/** Teachers & Staff (admin): the staff register with checkboxes and
 *  bulk actions, plus filters. Bulk status changes (suspend, revoke)
 *  run through the bulk_staff_action RPC (migration 0011) because
 *  only the platform owner may update profiles directly. */
export default function Teachers() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  const readOnly = !!profile && !canManage;
  const [school, setSchool] = useState<School | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [picks, setPicks] = useState<TeacherClassPick[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("Teacher");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  // Bulk selection + actions
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkStaffAction | "">("");
  const [grantPermission, setGrantPermission] = useState<string>(TEACHER_PERMISSIONS[0].id);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  const load = async () => {
    const { data: s } = schoolId
      ? await supabase.from("schools").select("*").eq("id", schoolId).single()
      : await supabase.from("schools").select("*").order("created_at").limit(1).single();
    if (!s) return;
    setSchool(s);
    const { data: t } = await supabase.from("teachers").select("*").eq("school_id", s.id).order("last_name");
    setTeachers(t ?? []);
    const { data: p } = await supabase.from("profiles").select("*").eq("school_id", s.id).eq("role", "teacher");
    setProfiles((p as Profile[] | null) ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", s.id).order("name");
    setClasses(c ?? []);
    const { data: pk } = await supabase.from("teacher_class_picks").select("*").eq("school_id", s.id);
    setPicks((pk as TeacherClassPick[] | null) ?? []);
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

  const profileOf = (t: Teacher) => profiles.find((p) => p.teacher_id === t.id);
  const statusOf = (t: Teacher) => profileOf(t)?.status ?? "No login yet";
  const classNameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? "-";
  const picksOf = (t: Teacher) => picks.filter((p) => p.teacher_id === t.id);

  // Classes a teacher is linked to: their own picks, plus classes
  // where they are class teacher (from the classes table).
  const classIdsOf = (t: Teacher) => {
    const ids = new Set(picksOf(t).map((p) => p.class_id));
    for (const c of classes) if (c.class_teacher_id === t.id) ids.add(c.id);
    return [...ids];
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      if (q && !`${t.first_name} ${t.last_name} ${t.email ?? ""}`.toLowerCase().includes(q)) return false;
      if (statusFilter && statusOf(t) !== statusFilter) return false;
      if (roleFilter === "senior" && !t.can_approve_parents) return false;
      if (roleFilter === "regular" && t.can_approve_parents) return false;
      if (roleFilter === "Teacher" || roleFilter === "Staff") {
        if (t.role !== roleFilter) return false;
      }
      if (classFilter && !classIdsOf(t).includes(classFilter)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers, profiles, picks, classes, search, statusFilter, roleFilter, classFilter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((t) => selected.includes(t.id));
  const toggleSelectAll = () => {
    setSelected((prev) =>
      allFilteredSelected
        ? prev.filter((id) => !filtered.some((t) => t.id === id))
        : [...new Set([...prev, ...filtered.map((t) => t.id)])],
    );
  };
  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runBulk = async () => {
    if (!bulkAction || selected.length === 0) return;
    if (bulkAction === "revoke" && !window.confirm(`Revoke access for ${selected.length} staff member(s)? Their logins become Rejected.`)) return;
    setBusy(true);
    setMsg("");
    const res = await bulkStaffAction(
      selected,
      bulkAction,
      bulkAction === "grant_access" ? grantPermission : undefined,
    );
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? "Bulk action failed.");
      return;
    }
    const n = typeof res.updated === "number" ? res.updated : selected.length;
    const label: Record<string, string> = {
      suspend: "suspended",
      reactivate: "reactivated",
      revoke: "revoked",
      make_senior: "made senior staff",
      remove_senior: "removed from senior staff",
      grant_access: "granted the chosen access",
    };
    setMsg(`${n} staff member(s) ${label[bulkAction] ?? "updated"}.`);
    setSelected([]);
    setBulkAction("");
    load();
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
            and can approve anyone. Teachers pick their own classes when
            they register; those picks show under each name.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Search</label>
              <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…" />
            </div>
            <div>
              <label className={labelCls}>Login status</label>
              <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Role / senior</label>
              <select className={inputCls} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                <option value="Teacher">Teacher</option>
                <option value="Staff">Staff</option>
                <option value="senior">Senior staff</option>
                <option value="regular">Regular (not senior)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Class</label>
              <select className={inputCls} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {!readOnly && filtered.length > 0 && (
            <div className="mb-3 rounded-xl border border-line bg-mist p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
                Select all {filtered.length} shown ({selected.length} selected)
              </label>
              {selected.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <select className={inputCls} value={bulkAction} onChange={(e) => setBulkAction(e.target.value as BulkStaffAction | "")}>
                      <option value="">- Bulk action -</option>
                      <option value="suspend">Suspend access</option>
                      <option value="reactivate">Reactivate (unsuspend)</option>
                      <option value="revoke">Revoke access</option>
                      <option value="make_senior">Make senior staff</option>
                      <option value="remove_senior">Remove senior staff</option>
                      <option value="grant_access">Grant access upgrade</option>
                    </select>
                    {bulkAction === "grant_access" && (
                      <select className={inputCls} value={grantPermission} onChange={(e) => setGrantPermission(e.target.value)}>
                        {TEACHER_PERMISSIONS.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    )}
                    <button className={btnCls} onClick={runBulk} disabled={busy || !bulkAction}>
                      Apply to {selected.length}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold"
                      onClick={() => setExpanded((prev) => [...new Set([...prev, ...selected])])}
                    >
                      View details
                    </button>
                    <button type="button" className="text-sm font-semibold text-royal" onClick={() => setSelected([])}>
                      Clear selection
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Suspend blocks the login until reactivated. Revoke rejects
                    it. Grant access gives the selected staff the permission
                    chosen above.
                  </p>
                </div>
              )}
            </div>
          )}

          <ul className="space-y-2 text-sm">
            {filtered.map((t) => {
              const st = statusOf(t);
              const prof = profileOf(t);
              const isOpen = expanded.includes(t.id);
              return (
                <li key={t.id} className="rounded-lg bg-mist px-3 py-2">
                  <div className="flex items-start gap-2">
                    {!readOnly && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.includes(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        aria-label={`Select ${t.first_name} ${t.last_name}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <strong>{t.first_name} {t.last_name}</strong> · {t.role}
                      {t.can_approve_parents && (
                        <span className="ml-1 rounded-full bg-royal px-2 py-0.5 text-xs text-white">Senior staff</span>
                      )}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${st === "Active" ? "bg-green-100 text-green-700" : st === "Pending" ? "bg-amber-100 text-amber-800" : st === "No login yet" ? "bg-slate-200 text-slate-600" : "bg-red-100 text-red-700"}`}>
                        {st}
                      </span>
                      <span className="block text-xs text-slate-500">{t.email ?? "-"} · {t.phone ?? "-"}</span>
                      {classIdsOf(t).length > 0 && (
                        <span className="block text-xs text-slate-500">
                          Classes: {classIdsOf(t).map(classNameOf).join(", ")}
                        </span>
                      )}
                      <div className="mt-1 flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={!!t.can_approve_parents}
                            disabled={readOnly}
                            onChange={(e) => toggleSenior(t, e.target.checked)}
                          />
                          Senior staff - can approve parent registrations
                        </label>
                        <button type="button" className="text-xs font-semibold text-royal" onClick={() => toggleExpanded(t.id)}>
                          {isOpen ? "Hide details" : "View details"}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                          <p><strong>Login:</strong> {prof ? `${prof.email} · ${prof.status}` : "No login yet - this record was added by the admin or has no account."}</p>
                          <p><strong>Role:</strong> {t.role}{t.can_approve_parents ? " · Senior staff (can approve parent registrations)" : ""}</p>
                          <p><strong>Phone:</strong> {t.phone ?? "-"}</p>
                          <p>
                            <strong>Classes picked:</strong>{" "}
                            {picksOf(t).length === 0
                              ? "None picked yet"
                              : picksOf(t).map((p) => classNameOf(p.class_id)).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                          </p>
                          <p>
                            <strong>Class teacher of:</strong>{" "}
                            {classes.filter((c) => c.class_teacher_id === t.id).map((c) => c.name).join(", ") || "None"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="text-slate-400">Nobody matches these filters.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
