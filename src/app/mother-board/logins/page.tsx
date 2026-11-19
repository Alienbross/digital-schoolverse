"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile, School } from "@/lib/types";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";

export default function MotherBoardLogins() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolFilter, setSchoolFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data: p } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setProfiles((p as Profile[]) ?? []);
    const { data: s } = await supabase.from("schools").select("*").order("name");
    setSchools((s as School[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const schoolName = (id: string | null) =>
    schools.find((s) => s.id === id)?.name ?? (id ? "-" : "Platform (no school)");

  const setStatus = async (p: Profile, status: string) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", p.id);
    setMsg(error ? `Could not update: ${error.message}` : `${p.email} is now ${status}.`);
    load();
  };

  const resetPassword = async (p: Profile) => {
    const { error } = await supabase.auth.resetPasswordForEmail(p.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setMsg(
      error
        ? `Could not send reset: ${error.message}`
        : `Password-reset email sent to ${p.email}.`,
    );
  };

  const deleteLogin = async (p: Profile) => {
    if (p.role === "platform_owner") {
      setMsg("The platform-owner login cannot be deleted from here.");
      return;
    }
    if (!window.confirm(`Delete the login for ${p.email}? Their profile row is removed; delete the auth user itself in Supabase → Authentication → Users if needed.`)) return;
    const { error } = await supabase.from("profiles").delete().eq("id", p.id);
    setMsg(error ? `Could not delete: ${error.message}` : `Login for ${p.email} deleted.`);
    load();
  };

  const filtered = profiles.filter(
    (p) =>
      (!schoolFilter || p.school_id === schoolFilter) &&
      (!roleFilter || p.role === roleFilter) &&
      (!search || `${p.email} ${p.display_name ?? ""}`.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div>
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <Card>
        <div className="mb-3 grid gap-3 md:grid-cols-4">
          <div><label className={labelCls}>Search</label><input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email or name…" /></div>
          <div><label className={labelCls}>School</label>
            <select className={inputCls} value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
              <option value="">All schools</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label className={labelCls}>Role</label>
            <select className={inputCls} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              <option value="platform_owner">platform_owner</option>
              <option value="school_admin">school_admin</option>
              <option value="teacher">teacher</option>
              <option value="student">student</option>
              <option value="parent">parent</option>
            </select></div>
          <div className="flex items-end"><span className="text-sm text-slate-500">{filtered.length} login(s)</span></div>
        </div>

        <ul className="space-y-2 text-sm">
          {filtered.map((p) => (
            <li key={p.id} className="rounded-lg bg-mist px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{p.email}</strong> · {p.role.replace("_", " ")} · {schoolName(p.school_id)}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${p.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {p.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {p.status === "Active" ? (
                  <button className="font-semibold text-amber-700" onClick={() => setStatus(p, "Suspended")}>Suspend</button>
                ) : (
                  <button className="font-semibold text-green-700" onClick={() => setStatus(p, "Active")}>Unsuspend</button>
                )}
                <button className="font-semibold text-royal" onClick={() => resetPassword(p)}>Send password reset</button>
                {p.role !== "platform_owner" && (
                  <button className="font-semibold text-red-600" onClick={() => deleteLogin(p)}>Delete login</button>
                )}
              </div>
            </li>
          ))}
          {filtered.length === 0 && <li className="text-slate-400">No logins match.</li>}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          New logins are generated on the Invites page or from a school’s
          Control page. Suspending blocks the account in the app; deleting
          removes the profile row (the auth user itself is removed in
          Supabase → Authentication → Users).
        </p>
      </Card>
      <p className="mt-4 text-sm text-slate-500">
        Need to generate a login?{" "}
        <a href="/mother-board/invites" className="font-semibold text-royal">Go to Invites →</a>
      </p>
    </div>
  );
}
