"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type { StudentProfileShare } from "@/lib/types";
import { SchoolLogo } from "@/components/school-logo";
import { Card, ConfigBanner, PageHeader, btnCls } from "@/components/ui";
import {
  analyseProfile,
  loadStudentProfileData,
  profileSummaryText,
  type StudentProfileData,
} from "@/lib/student-profile";
import { DomainRatingsView } from "@/components/workspace/assessments";

/** Student Profile - one pupil's analysed summary for counsellors,
 *  admin, class teachers, the pupil and (once shared) their parents.
 *
 *  Who can see what:
 *  - Platform owner / school admin: any pupil in the school.
 *  - Teacher: only pupils in classes they teach or are class
 *    teacher of. Other pupils show "not one of your pupils".
 *  - Student: only themselves.
 *  - Parent: only their own linked children, and only once the
 *    school has shared this profile with them (a share row exists).
 *    Before sharing they see "not shared yet" instead of the data.
 *  - Pending accounts see the pending notice and no profile data.
 *
 *  Sharing: the admin (or owner) shares the plain-language summary
 *  with the pupil's linked parents in-app - one row in
 *  `student_profile_shares` per share, with the date. Download /
 *  print uses the browser print - the profile never changes a
 *  grade, an attendance mark or a fee. */
export default function StudentProfile() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const { profile, loading: authLoading } = useAuth();
  const base = useWorkspaceBase();
  const canManage = useCanManage();
  const [data, setData] = useState<StudentProfileData | null>(null);
  const [state, setState] = useState("loading");
  const [denied, setDenied] = useState("");
  const [shares, setShares] = useState<StudentProfileShare[]>([]);
  const [shareMsg, setShareMsg] = useState("");
  const [sharing, setSharing] = useState(false);

  const role = profile?.role ?? null;
  const isParent = role === "parent";
  const isStudent = role === "student";
  const isTeacher = role === "teacher";
  const isPending = profile?.status === "Pending";

  const backHref =
    isStudent
      ? `${base}/student`
      : isParent
        ? `${base}/parent`
        : isTeacher
          ? `${base}/teacher`
          : `${base}/students`;

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      const d = await loadStudentProfileData(studentId);
      if (!d) {
        setState("not-found");
        return;
      }
      // Access check, on top of RLS (which already limits reads to
      // the signed-in user's own school).
      if (isStudent && profile?.student_id !== studentId) {
        setDenied("This profile belongs to another pupil.");
        setState("denied");
        return;
      }
      if (isParent) {
        const mine = d.parents.some((p) => p.id === profile?.parent_id);
        if (!mine) {
          setDenied("This pupil is not linked to your parent account.");
          setState("denied");
          return;
        }
      }
      if (isTeacher) {
        const teacherId = profile?.teacher_id;
        const { data: classSubjects } = await supabase
          .from("class_subjects")
          .select("class_id")
          .eq("teacher_id", teacherId ?? "");
        const { data: classes } = await supabase
          .from("classes")
          .select("id")
          .eq("class_teacher_id", teacherId ?? "");
        const myClassIds = new Set<string>([
          ...((classSubjects as { class_id: string }[] | null) ?? []).map((c) => c.class_id),
          ...((classes as { id: string }[] | null) ?? []).map((c) => c.id),
        ]);
        if (!d.student.class_id || !myClassIds.has(d.student.class_id)) {
          setDenied("This pupil is not in one of your classes.");
          setState("denied");
          return;
        }
      }
      setData(d);
      // Share history for this pupil (current term first).
      const { data: sh } = await supabase
        .from("student_profile_shares")
        .select("*")
        .eq("student_id", studentId)
        .order("shared_at", { ascending: false });
      setShares((sh as StudentProfileShare[] | null) ?? []);
      setState("ready");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, studentId]);

  const analysis = data ? analyseProfile(data) : null;
  const sharedThisTerm = data && shares.some((s) => s.term_id === (data.term?.id ?? null));
  const canShare = canManage && !!data && data.parents.length > 0;

  const shareWithParents = async () => {
    if (!data || !analysis || !profile) return;
    setSharing(true);
    setShareMsg("");
    const { error } = await supabase.from("student_profile_shares").insert({
      school_id: data.student.school_id,
      student_id: data.student.id,
      term_id: data.term?.id ?? null,
      shared_by: profile.id,
      summary_text: profileSummaryText(data, analysis),
    });
    if (error) {
      setShareMsg(`Could not share: ${error.message}`);
    } else {
      setShareMsg("Shared with the parent - they can now open this profile from their workspace.");
      const { data: sh } = await supabase
        .from("student_profile_shares")
        .select("*")
        .eq("student_id", studentId)
        .order("shared_at", { ascending: false });
      setShares((sh as StudentProfileShare[] | null) ?? []);
    }
    setSharing(false);
  };

  if (state === "loading") {
    return (
      <div>
        <ConfigBanner />
        <p className="text-sm text-slate-500">Loading profile…</p>
      </div>
    );
  }

  if (state === "not-found") {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Student profile" sub="No pupil with that record was found." />
        <Link href={backHref} className="font-semibold text-royal">← Back</Link>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Student profile" sub={denied} />
        <Link href={backHref} className="font-semibold text-royal">← Back</Link>
      </div>
    );
  }

  if (!data || !analysis) return null;

  // Parents only see the profile once the school has shared it.
  if (isParent && !sharedThisTerm) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader
          title={`Student profile - ${data.student.first_name} ${data.student.last_name}`}
          sub="The school has not shared this profile summary with you yet. Once the admin shares it, it will appear here."
        />
        <Link href={backHref} className="font-semibold text-royal">← Back to my children</Link>
      </div>
    );
  }

  const bandColour =
    analysis.behaviourBand === "Excellent"
      ? "text-green-700"
      : analysis.behaviourBand === "Good"
        ? "text-royal"
        : analysis.behaviourBand === "Needs attention"
          ? "text-amber-700"
          : "text-red-700";

  return (
    <div>
      <ConfigBanner />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {data.school && <SchoolLogo name={data.school.name} logoUrl={data.school.logo_url} size={48} />}
          <div>
            <h1 className="text-xl font-bold">
              {data.student.first_name} {data.student.last_name}
            </h1>
            <p className="text-sm text-slate-500">
              {data.className} · {data.student.admission_no}
              {data.term ? ` · ${data.term.name} ${data.term.session}` : " · No current term set"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`${base}/students/${data.student.id}/report-card`} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">
            Report card →
          </Link>
          <button className={btnCls} onClick={() => window.print()}>Download / print</button>
        </div>
      </div>
      {isPending && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account is waiting for approval - this profile is read-only for now.
        </div>
      )}
      {isParent && sharedThisTerm && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          Shared with you by the school on{" "}
          {new Date(shares.find((s) => s.term_id === (data.term?.id ?? null))?.shared_at ?? "").toLocaleDateString()}.
        </div>
      )}

      {/* Analysed summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-2 font-semibold">Behaviour - {analysis.behaviourScore}/100</h2>
          <p className={`text-2xl font-bold ${bandColour}`}>{analysis.behaviourBand}</p>
          <p className="mt-2 text-xs text-slate-500">
            Starts at 100. Every deduction is listed below - nothing is hidden.
          </p>
          {analysis.deductions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No deductions this term.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {analysis.deductions.map((d) => (
                <li key={d.label} className="flex justify-between gap-2">
                  <span>{d.label}</span>
                  <strong className="text-red-700">{d.points}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Discipline -10 each (max -30) · Absence -3 each (max -15) · Late -1 each (max -5) · Open complaint -5 each (max -10). Clinic visits are health, not behaviour, so they never lower this score.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">At a glance</h2>
          <ul className="space-y-1 text-sm">
            <li><strong>Attendance:</strong> {data.attPct !== null ? `${data.attPct}% (${data.attPresent} present, ${data.attLate} late, ${data.attAbsent} absent of ${data.attTotal} days)` : "No register days yet"}</li>
            <li><strong>Average score:</strong> {data.average !== null ? `${data.average.toFixed(1)}/100${data.classPosition !== null ? ` · ${data.classPosition} of ${data.classPositionOf} in class` : ""}` : "No scores yet"}</li>
            <li><strong>Fees:</strong> {data.feeBilled > 0 ? `Billed ₦${data.feeBilled.toLocaleString()} · Paid ₦${data.feePaid.toLocaleString()} · Balance ₦${data.feeBalance.toLocaleString()}` : "No bill this term"}</li>
            <li><strong>Homework:</strong> {data.homeworkSet} set · {data.homeworkOverdue.length} overdue</li>
            <li><strong>CBT:</strong> {data.cbtAverage !== null ? `${data.cbtAverage.toFixed(0)}% average over ${data.cbtAttempts.length} attempt${data.cbtAttempts.length === 1 ? "" : "s"}` : "No CBT attempts yet"}</li>
            <li><strong>Clinic:</strong> {data.clinicVisits.length} visit{data.clinicVisits.length === 1 ? "" : "s"} · {data.clinicSentHome} sent home · {data.clinicReferred} referred</li>
            <li><strong>Discipline:</strong> {data.discipline.length} record{data.discipline.length === 1 ? "" : "s"}</li>
            <li><strong>Complaints:</strong> {data.complaintsOpen} open · {data.complaintsResolved} resolved</li>
            <li><strong>Bus:</strong> {data.busRoute ?? "Not on a bus route"}</li>
            <li><strong>Weekly summaries shared:</strong> {data.weeklySummariesShared}</li>
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Suggested next steps</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {analysis.nextSteps.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold text-green-700">What is going well</h2>
          {analysis.strengths.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing stands out yet this term.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {analysis.strengths.map((s) => <li key={s}>{s}</li>)}
            </ul>
          )}
          {analysis.watch.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 font-semibold text-amber-700">Worth watching</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {analysis.watch.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-red-700">What needs attention</h2>
          {analysis.concerns.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing flagged this term.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {analysis.concerns.map((s) => <li key={s}>{s}</li>)}
            </ul>
          )}
        </Card>
      </div>

      {/* Scores */}
      <Card>
        <h2 className="mb-3 font-semibold">Scores this term</h2>
        {data.subjects.length === 0 ? (
          <p className="text-sm text-slate-500">No scores entered for this term yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-2">Subject</th>
                  <th className="py-1 pr-2">Test /20</th>
                  <th className="py-1 pr-2">Assignment /10</th>
                  <th className="py-1 pr-2">Exam /70</th>
                  <th className="py-1 pr-2">Total</th>
                  <th className="py-1 pr-2">Grade</th>
                  <th className="py-1">Remark</th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.map((s) => (
                  <tr key={s.subject} className="border-t border-line">
                    <td className="py-1 pr-2 font-semibold">{s.subject}</td>
                    <td className="py-1 pr-2">{s.test ?? "-"}</td>
                    <td className="py-1 pr-2">{s.assignment ?? "-"}</td>
                    <td className="py-1 pr-2">{s.exam ?? "-"}</td>
                    <td className="py-1 pr-2 font-semibold">{s.total}</td>
                    <td className="py-1 pr-2">{s.grade}</td>
                    <td className="py-1">{s.remark ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.strongest && <p className="mt-2 text-sm text-slate-600">Strongest: {data.strongest} · Weakest: {data.weakest}</p>}
      </Card>

      {/* Affective & psychomotor (migration 0012) */}
      <Card>
        <h2 className="mb-3 font-semibold">Affective &amp; psychomotor this term</h2>
        <DomainRatingsView ratings={data.domains} />
      </Card>

      {/* Attendance detail */}
      <Card>
        <h2 className="mb-3 font-semibold">Attendance this term</h2>
        <p className="text-sm">
          Present {data.attPresent} · Late {data.attLate} · Absent {data.attAbsent} · Excused {data.attExcused} · {data.attTotal} register days
        </p>
        {data.attPattern && <p className="mt-1 text-sm text-amber-700">{data.attPattern}</p>}
        {data.attReasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {data.attReasons.map((r, i) => (
              <li key={`${r.date}-${i}`}>{r.date} - {r.reason}</li>
            ))}
          </ul>
        )}
        {data.attTotal === 0 && <p className="mt-1 text-sm text-slate-500">No register days recorded for this term yet.</p>}
      </Card>

      {/* Behaviour records */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Discipline records</h2>
          {data.discipline.length === 0 ? (
            <p className="text-sm text-slate-500">No discipline records this term.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.discipline.map((x, i) => (
                <li key={`${x.date}-${i}`} className="rounded-lg bg-mist px-3 py-2">
                  <strong>{x.date} - {x.category}</strong>
                  {x.description && <p className="text-slate-600">{x.description}</p>}
                  {x.actionTaken && <p className="text-slate-600">Action: {x.actionTaken}</p>}
                  <p className="text-slate-500">Parent informed: {x.parentInformed ? "Yes" : "Not yet"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Clinic visits</h2>
          {data.clinicVisits.length === 0 ? (
            <p className="text-sm text-slate-500">No clinic visits this term.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.clinicVisits.map((v, i) => (
                <li key={`${v.date}-${i}`} className="rounded-lg bg-mist px-3 py-2">
                  <strong>{v.date} - {v.complaint}</strong>
                  <p className="text-slate-600">Outcome: {v.outcome}{v.attendedBy ? ` · Attended by ${v.attendedBy}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* CBT, homework, complaints, bus */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">CBT practice</h2>
          {data.cbtAttempts.length === 0 ? (
            <p className="text-sm text-slate-500">No CBT attempts this term.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.cbtAttempts.map((a, i) => (
                <li key={`${a.title}-${i}`}>
                  {a.title} ({a.subject}, {a.mode}) - {a.percentage !== null ? `${a.percentage}%${a.grade ? ` · Grade ${a.grade}` : ""}` : "No score"}
                </li>
              ))}
            </ul>
          )}
          {data.homeworkOverdue.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 font-semibold">Overdue homework</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {data.homeworkOverdue.map((h) => (
                  <li key={h.title}>{h.title} ({h.subject}) - due {h.dueDate}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Complaints about this pupil</h2>
          {data.complaints.length === 0 ? (
            <p className="text-sm text-slate-500">No complaints about this pupil this term.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.complaints.map((c) => (
                <li key={c.reference}>{c.reference} - {c.category} · {c.status}{c.subject ? ` · ${c.subject}` : ""}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-slate-600">
            Bus: {data.busRoute ? `${data.busRoute}${data.busPickup ? ` · Pickup ${data.busPickup}` : ""}${data.busDropoff ? ` · Drop-off ${data.busDropoff}` : ""}` : "Not on a bus route"}
          </p>
        </Card>
      </div>

      {/* Share with parent (admin / owner only) */}
      {canManage && (
        <Card>
          <h2 className="mb-2 font-semibold">Share with parent</h2>
          {data.parents.length === 0 ? (
            <p className="text-sm text-slate-500">No parent is linked to this pupil yet - link one under Parents first.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Linked parent{data.parents.length === 1 ? "" : "s"}: {data.parents.map((p) => p.name).join(", ")}.
                Sharing puts this plain-language summary in the parent&apos;s workspace - it never changes a grade, attendance mark or fee.
              </p>
              <button className={`${btnCls} mt-3`} onClick={shareWithParents} disabled={sharing}>
                {sharing ? "Sharing…" : sharedThisTerm ? "Share again with parent" : "Share this profile with the parent"}
              </button>
              {shareMsg && <p className="mt-2 text-sm font-medium text-royal">{shareMsg}</p>}
            </>
          )}
          {shares.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Shared before</h3>
              <ul className="space-y-1 text-sm text-slate-600">
                {shares.map((s) => (
                  <li key={s.id}>
                    Shared {new Date(s.shared_at).toLocaleDateString()} - {s.term_id === (data.term?.id ?? null) ? "this term" : "another term"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
      <p className="mt-4 text-sm">
        <Link href={backHref} className="font-semibold text-royal">← Back</Link>
      </p>
    </div>
  );
}
