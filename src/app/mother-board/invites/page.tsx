"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { createInvite, inviteLink } from "@/lib/invites";
import type { Role, School, SchoolInvite } from "@/lib/types";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";

export default function MotherBoardInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<SchoolInvite[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("school_admin");
  const [schoolId, setSchoolId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [lastLink, setLastLink] = useState("");

  const load = async () => {
    const { data: inv } = await supabase.from("invites").select("*").order("created_at", { ascending: false });
    setInvites((inv as SchoolInvite[]) ?? []);
    const { data: s } = await supabase.from("schools").select("*").order("name");
    setSchools((s as School[]) ?? []);
    if (!schoolId && s?.length) setSchoolId((s as School[])[0].id);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const school = schools.find((s) => s.id === schoolId);
    if (!school || !email.trim()) return;
    setBusy(true);
    setMsg("");
    setLastLink("");
    const res = await createInvite({
      email: email.trim(),
      role,
      schoolId: school.id,
      schoolName: school.name,
      createdBy: user?.id ?? null,
    });
    if (!res.invite) {
      setMsg(`Could not create invite: ${res.error}`);
      setBusy(false);
      return;
    }
    setLastLink(inviteLink(res.invite.token));
    setMsg(`Invite created for ${email.trim()} — ${role.replace("_", " ")} at ${school.name}. Share the link below.`);
    setEmail("");
    setBusy(false);
    load();
  };

  const revoke = async (inv: SchoolInvite) => {
    const { error } = await supabase.from("invites").update({ status: "Revoked" }).eq("id", inv.id);
    setMsg(error ? `Could not revoke: ${error.message}` : "Invite revoked.");
    load();
  };

  const resend = (inv: SchoolInvite) => {
    // No email is sent yet — "resend" re-shows the live link to share.
    setLastLink(inviteLink(inv.token));
    setMsg(`Invite link for ${inv.email} is shown below — share it again. (Live email sending plugs in later.)`);
  };

  return (
    <div>
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      {lastLink && (
        <Card>
          <h2 className="mb-2 font-semibold">Invite link — share it</h2>
          <p className="mb-2 break-all rounded-lg bg-mist px-3 py-2 font-mono text-xs">{lastLink}</p>
          <button className="text-sm font-semibold text-royal" onClick={() => navigator.clipboard?.writeText(lastLink)}>
            Copy link
          </button>
        </Card>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">Generate an invite</h2>
          <form onSubmit={create} className="space-y-3">
            <div><label className={labelCls}>Email</label><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@school.com" /></div>
            <div><label className={labelCls}>Role</label>
              <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="school_admin">school_admin</option>
                <option value="teacher">teacher</option>
                <option value="student">student</option>
                <option value="parent">parent</option>
              </select></div>
            <div><label className={labelCls}>School</label>
              <select className={inputCls} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <button className={btnCls} disabled={busy || schools.length === 0}>
              {schools.length === 0 ? "Create a school first" : "Generate invite"}
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Invites last 7 days. The person opens the link, sets a password,
            and logs in. Only the platform owner can invite a school admin;
            school admins invite their own teachers, students and parents.
          </p>
        </Card>

        <div className="md:col-span-2">
          <Card>
            <h2 className="mb-3 font-semibold">All invites ({invites.length})</h2>
            <ul className="space-y-2 text-sm">
              {invites.map((inv) => (
                <li key={inv.id} className="rounded-lg bg-mist px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{inv.email}</strong> · {inv.role.replace("_", " ")} · {inv.school_name}
                    </span>
                    <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold">{inv.status}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs">
                    <span className="text-slate-500">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                      {inv.accepted_at ? ` · Accepted ${new Date(inv.accepted_at).toLocaleDateString()}` : ""}
                    </span>
                    {inv.status === "Pending" && (
                      <>
                        <button className="font-semibold text-royal" onClick={() => resend(inv)}>Show link</button>
                        <button className="font-semibold text-red-600" onClick={() => revoke(inv)}>Revoke</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
              {invites.length === 0 && <li className="text-slate-400">No invites yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
