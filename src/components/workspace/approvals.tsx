"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  decidePupilLink,
  decideRegistration,
  fetchPendingLinks,
  fetchPendingProfiles,
  type PendingLink,
} from "@/lib/registration";
import type { Profile, Student } from "@/lib/types";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";

/** Pending approvals list, used by:
 *  - the school admin, on the Registration page (all roles + all
 *    proposed pupil links);
 *  - a class teacher, in their workspace (pending students in their
 *    classes, and pending parents when they are senior staff).
 *  Who may actually decide each row is enforced again by the
 *  decide_registration / decide_pupil_link RPCs (migration 0006). */
export default function ApprovalsList({
  schoolId,
  scope,
  myClassIds,
  canApproveParents,
}: {
  schoolId: string;
  scope: "admin" | "teacher";
  /** Classes this teacher teaches (teacher scope only). */
  myClassIds?: string[];
  /** Whether this teacher is senior staff (teacher scope only). */
  canApproveParents?: boolean;
}) {
  const { profile } = useAuth();
  const [pending, setPending] = useState<Profile[]>([]);
  const [links, setLinks] = useState<PendingLink[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState("");

  const load = async () => {
    const [profiles, pendingLinks] = await Promise.all([
      fetchPendingProfiles(schoolId),
      fetchPendingLinks(schoolId),
    ]);
    setPending(profiles);
    setLinks(pendingLinks);
    const { data: st } = await supabase
      .from("students")
      .select("*")
      .eq("school_id", schoolId);
    setStudents((st as Student[] | null) ?? []);
  };

  /* eslint-disable react-hooks/set-state-in-effect -- same data-loading pattern as the rest of this codebase */
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // What this viewer may decide. (The RPCs re-check server-side.)
  const visibleProfiles = pending.filter((p) => {
    if (scope === "admin") return true;
    if (p.role === "student") {
      const pupil = students.find((s) => s.id === p.student_id);
      return !!pupil?.class_id && (myClassIds ?? []).includes(pupil.class_id);
    }
    if (p.role === "parent") return !!canApproveParents;
    return false; // teachers are decided by the admin only
  });
  const visibleLinks = links.filter((l) => {
    if (scope === "admin") return true;
    return !!l.class_id && (myClassIds ?? []).includes(l.class_id);
  });
  // Links of a still-pending parent are decided with the parent's
  // account (approving the parent approves their links), so the
  // separate link list only shows links from already-approved parents.
  const pendingParentIds = new Set(
    pending.filter((p) => p.role === "parent").map((p) => p.parent_id),
  );
  const standaloneLinks = visibleLinks.filter(
    (l) => !pendingParentIds.has(l.parent_id),
  );

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    setMsg("");
    const res = await decideRegistration(
      id,
      approve,
      approve ? "" : (rejectReason[id] ?? ""),
    );
    setBusyId("");
    if (!res.ok) {
      setMsg(res.error ?? "Could not decide this registration.");
      return;
    }
    setMsg(approve ? "Approved." : "Rejected.");
    setRejectingId("");
    load();
  };

  const decideLink = async (id: string, approve: boolean) => {
    setBusyId(id);
    setMsg("");
    const res = await decidePupilLink(
      id,
      approve,
      approve ? "" : (rejectReason[id] ?? ""),
    );
    setBusyId("");
    if (!res.ok) {
      setMsg(res.error ?? "Could not decide this pupil link.");
      return;
    }
    setMsg(approve ? "Pupil link approved." : "Pupil link rejected.");
    setRejectingId("");
    load();
  };

  const pupilsOfParent = (parentId: string | null) =>
    links.filter((l) => l.parent_id === parentId);

  const studentOf = (p: Profile) =>
    students.find((s) => s.id === p.student_id);

  if (visibleProfiles.length === 0 && standaloneLinks.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          Nothing waiting for approval right now.
          {scope === "teacher" &&
            " You will see pending students from your classes here" +
              (canApproveParents ? ", and pending parents (senior staff)." : ".")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm font-medium text-royal">{msg}</p>}
      {visibleProfiles.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            Accounts waiting for approval ({visibleProfiles.length})
          </h2>
          {visibleProfiles.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {p.display_name ?? p.email}{" "}
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {p.role.replace("_", " ")}
                    </span>
                  </p>
                  <p className="text-sm text-slate-500">
                    {p.email} · registered{" "}
                    {new Date(p.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  {p.role === "student" && studentOf(p) && (
                    <p className="mt-1 text-sm">
                      Pupil: <strong>{studentOf(p)?.first_name} {studentOf(p)?.last_name}</strong> ·{" "}
                      {studentOf(p)?.admission_no}
                    </p>
                  )}
                  {p.role === "parent" && (
                    <div className="mt-2 text-sm">
                      <p className="font-semibold">Proposed children:</p>
                      {pupilsOfParent(p.parent_id).length === 0 ? (
                        <p className="text-slate-500">No pupils added yet.</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {pupilsOfParent(p.parent_id).map((l) => (
                            <li key={l.id} className="rounded-lg bg-mist px-3 py-1.5">
                              <strong>{l.student_name}</strong> · {l.class_name ?? "No class"} ·{" "}
                              {l.admission_no}
                              {l.relationship ? ` · ${l.relationship}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1 text-xs text-slate-400">
                        Approving this parent also approves these pupil links.
                        Check each child is the right one.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <button
                      className={btnCls}
                      disabled={busyId === p.id}
                      onClick={() => decide(p.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
                      disabled={busyId === p.id}
                      onClick={() => setRejectingId(rejectingId === p.id ? "" : p.id)}
                    >
                      Reject
                    </button>
                  </div>
                  {rejectingId === p.id && (
                    <div className="w-64 space-y-2">
                      <div>
                        <label className={labelCls}>Reason (shown to them)</label>
                        <input
                          className={inputCls}
                          value={rejectReason[p.id] ?? ""}
                          onChange={(e) =>
                            setRejectReason((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder="e.g. Wrong class — re-register"
                        />
                      </div>
                      <button
                        className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                        disabled={busyId === p.id}
                        onClick={() => decide(p.id, false)}
                      >
                        Confirm rejection
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {standaloneLinks.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            Pupil links waiting for a decision ({standaloneLinks.length})
          </h2>
          <p className="text-sm text-slate-500">
            A parent added one of these pupils after their account was
            approved. Check the child and class are right before approving.
          </p>
          {standaloneLinks.map((l) => (
            <Card key={l.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {l.parent_name} → {l.student_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {l.class_name ?? "No class"} · {l.admission_no}
                    {l.relationship ? ` · ${l.relationship}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <button
                      className={btnCls}
                      disabled={busyId === l.id}
                      onClick={() => decideLink(l.id, true)}
                    >
                      Approve link
                    </button>
                    <button
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
                      disabled={busyId === l.id}
                      onClick={() => setRejectingId(rejectingId === l.id ? "" : l.id)}
                    >
                      Reject
                    </button>
                  </div>
                  {rejectingId === l.id && (
                    <div className="w-64 space-y-2">
                      <div>
                        <label className={labelCls}>Reason (shown to them)</label>
                        <input
                          className={inputCls}
                          value={rejectReason[l.id] ?? ""}
                          onChange={(e) =>
                            setRejectReason((prev) => ({ ...prev, [l.id]: e.target.value }))
                          }
                          placeholder="e.g. Not this pupil"
                        />
                      </div>
                      <button
                        className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                        disabled={busyId === l.id}
                        onClick={() => decideLink(l.id, false)}
                      >
                        Confirm rejection
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {profile?.role === "teacher" && scope === "teacher" && (
        <p className="text-xs text-slate-400">
          Teacher registrations are approved by the school admin only. Student
          registrations can be approved by you (their class teacher) or the
          admin. Parent registrations can be approved by the admin or senior
          staff.
        </p>
      )}
    </div>
  );
}
