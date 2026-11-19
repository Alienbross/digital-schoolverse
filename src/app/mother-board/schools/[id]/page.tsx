"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { createInvite, inviteLink } from "@/lib/invites";
import type { Parent, Role, School, SchoolInvite, Student, Teacher } from "@/lib/types";
import { schoolCounts } from "@/lib/mother-board";
import { LogoUploadField, SchoolLogo } from "@/components/school-logo";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";

const ROLES: Role[] = ["school_admin", "teacher", "student", "parent"];

export default function SchoolControl() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const { user } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [counts, setCounts] = useState({ students: 0, teachers: 0, parents: 0, openComplaints: 0 });
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [invites, setInvites] = useState<SchoolInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [linkId, setLinkId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const load = async () => {
    const { data: s } = await supabase.from("schools").select("*").eq("id", schoolId).single();
    if (!s) return;
    setSchool(s as School);
    setCounts(await schoolCounts(schoolId));
    const { data: t } = await supabase.from("teachers").select("*").eq("school_id", schoolId).order("last_name");
    setTeachers((t as Teacher[]) ?? []);
    const { data: st } = await supabase.from("students").select("*").eq("school_id", schoolId).order("last_name");
    setStudents((st as Student[]) ?? []);
    const { data: p } = await supabase.from("parents").select("*").eq("school_id", schoolId).order("last_name");
    setParents((p as Parent[]) ?? []);
    const { data: inv } = await supabase.from("invites").select("*").eq("school_id", schoolId).order("created_at", { ascending: false });
    setInvites((inv as SchoolInvite[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const generateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !email.trim()) return;
    setBusy(true);
    setMsg("");
    setInviteUrl("");
    const res = await createInvite({
      email: email.trim(),
      role,
      schoolId: school.id,
      schoolName: school.name,
      createdBy: user?.id ?? null,
      teacherId: role === "teacher" ? linkId || null : null,
      studentId: role === "student" ? linkId || null : null,
      parentId: role === "parent" ? linkId || null : null,
    });
    if (!res.invite) {
      setMsg(`Could not create invite: ${res.error}`);
      setBusy(false);
      return;
    }
    setInviteUrl(inviteLink(res.invite.token));
    setMsg(`Login invite created for ${email.trim()} (${role.replace("_", " ")}). Share the link below.`);
    setEmail("");
    setLinkId("");
    setBusy(false);
    load();
  };

  const revokeInvite = async (inv: SchoolInvite) => {
    const { error } = await supabase.from("invites").update({ status: "Revoked" }).eq("id", inv.id);
    setMsg(error ? `Could not revoke: ${error.message}` : "Invite revoked.");
    load();
  };

  const linkOptions =
    role === "teacher"
      ? teachers.map((t) => ({ id: t.id, label: `${t.first_name} ${t.last_name}` }))
      : role === "student"
        ? students.map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name} (${s.admission_no})` }))
        : role === "parent"
          ? parents.map((p) => ({ id: p.id, label: `${p.first_name} ${p.last_name}` }))
          : [];

  if (!school) return <p className="text-sm text-slate-500">Loading school…</p>;

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link href="/mother-board/schools" className="font-semibold text-royal">← All schools</Link>
      </p>
      <h2 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <SchoolLogo name={school.name} logoUrl={school.logo_url} size={44} />
        {school.name}
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        {school.plan} plan · {school.status} · {counts.students} pupils · {counts.teachers} teachers ·{" "}
        {counts.parents} parents · {counts.openComplaints} open complaints
      </p>
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      {inviteUrl && (
        <Card>
          <h2 className="mb-2 font-semibold">Invite link — share it</h2>
          <p className="mb-2 break-all rounded-lg bg-mist px-3 py-2 font-mono text-xs">{inviteUrl}</p>
          <button className="text-sm font-semibold text-royal" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>
            Copy link
          </button>
        </Card>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">School logo</h2>
          <LogoUploadField
            schoolId={school.id}
            schoolName={school.name}
            currentUrl={school.logo_url}
            onChanged={() => load()}
          />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Generate a login for this school</h2>
          <form onSubmit={generateLogin} className="space-y-3">
            <div><label className={labelCls}>Email</label><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@school.com" /></div>
            <div><label className={labelCls}>Role</label>
              <select className={inputCls} value={role} onChange={(e) => { setRole(e.target.value as Role); setLinkId(""); }}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </select></div>
            {linkOptions.length > 0 && (
              <div><label className={labelCls}>Link to existing record (optional)</label>
                <select className={inputCls} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                  <option value="">— No link —</option>
                  {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select></div>
            )}
            <button className={btnCls} disabled={busy}>Generate login invite</button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            The person opens the link, sets a password, and logs in with this
            role for this school only. No email is sent yet.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Invites for this school ({invites.length})</h2>
          <ul className="space-y-2 text-sm">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                <span>
                  <strong>{inv.email}</strong> · {inv.role.replace("_", " ")}
                  <span className="block text-xs text-slate-500">{inv.status} · expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                </span>
                {inv.status === "Pending" && (
                  <button className="font-semibold text-red-600" onClick={() => revokeInvite(inv)}>Revoke</button>
                )}
              </li>
            ))}
            {invites.length === 0 && <li className="text-slate-400">No invites yet.</li>}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Teachers ({teachers.length})</h2>
          <ul className="space-y-1 text-sm">
            {teachers.map((t) => <li key={t.id}>{t.first_name} {t.last_name} · {t.role}</li>)}
            {teachers.length === 0 && <li className="text-slate-400">None yet.</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Pupils ({students.length}) · Parents ({parents.length})</h2>
          <ul className="space-y-1 text-sm">
            {students.slice(0, 10).map((s) => <li key={s.id}>{s.first_name} {s.last_name} · {s.admission_no}</li>)}
            {students.length > 10 && <li className="text-slate-400">…and {students.length - 10} more.</li>}
            {students.length === 0 && <li className="text-slate-400">No pupils yet.</li>}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Full registers live in the school workspace (sidebar, pick this
            school under “View school workspace as”).
          </p>
        </Card>
      </div>
    </div>
  );
}
