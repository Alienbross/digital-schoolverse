"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspaceBase } from "@/lib/slug";
import { fetchCurrentTerm } from "@/lib/roles";
import { Card } from "@/components/ui";
import { sendTeacherDigestEmail } from "@/lib/teacher-digest";
import {
  countNeedingAttentionToday,
  loadAdminTeacherTaskCounts,
  REMINDER_KIND_LABELS,
  REMINDER_URGENCY_LABELS,
  type TeacherReminder,
  type TeacherTabTarget,
  type TeacherTaskCount,
} from "@/lib/teacher-reminders";

// ---------------------------------------------------------------- teacher view

/** The teacher's reminder list, grouped Overdue / Due today / Due
 *  soon. Each row opens the tab where the job gets done - reminders
 *  never change data themselves. The email button sends today's
 *  digest to the teacher via sendTeacherDigestEmail() (Resend);
 *  with no key configured it reports that plainly and nothing
 *  changes. There is no scheduler yet - the teacher sends it. */
export function RemindersList({
  reminders,
  onGo,
  teacherEmail,
  teacherName,
  schoolName,
}: {
  reminders: TeacherReminder[];
  onGo: (tab: TeacherTabTarget) => void;
  teacherEmail?: string;
  teacherName?: string;
  schoolName?: string;
}) {
  const groups: { urgency: "overdue" | "today" | "soon"; heading: string }[] = [
    { urgency: "overdue", heading: "Overdue - do these first" },
    { urgency: "today", heading: "Due today" },
    { urgency: "soon", heading: "Due soon" },
  ];
  const needingToday = countNeedingAttentionToday(reminders);
  const [digestMsg, setDigestMsg] = useState("");
  const [digestBusy, setDigestBusy] = useState(false);

  const sendDigest = async () => {
    if (!teacherEmail?.trim() || digestBusy) return;
    setDigestBusy(true);
    setDigestMsg("");
    const result = await sendTeacherDigestEmail({
      teacherEmail: teacherEmail.trim(),
      teacherName: teacherName?.trim() || "Teacher",
      schoolName: schoolName?.trim() || "Digital SchoolVerse",
      reminders,
    });
    setDigestBusy(false);
    setDigestMsg(
      result.sent
        ? `Digest email sent to ${teacherEmail.trim()}.`
        : result.configured
          ? "The digest email could not be sent - try again in a moment."
          : "Live email is not connected yet, so no digest was sent. Your reminders are still listed here.",
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm">
          <strong>{needingToday} task{needingToday === 1 ? "" : "s"} need{needingToday === 1 ? "s" : ""} your attention today</strong>
          {reminders.length > needingToday && (
            <span className="text-slate-500"> · {reminders.length - needingToday} more due soon</span>
          )}
          {reminders.length === 0 && (
            <span className="text-slate-500"> · Nothing outstanding - well done.</span>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Reminders are worked out from your saved registers, scores, homework, CBT tests, complaints and weekly summaries.
          They never change a grade, a register or a fee - tap one to go and do the job.
        </p>
        {teacherEmail?.trim() && (
          <div className="mt-3">
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold"
              onClick={sendDigest}
              disabled={digestBusy}
            >
              {digestBusy ? "Sending..." : "Email me today's digest"}
            </button>
            {digestMsg && <p className="mt-2 text-xs font-medium text-royal">{digestMsg}</p>}
          </div>
        )}
      </Card>
      {reminders.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No reminders right now. When a register is not taken, scores are missing, homework or a test comes due, or a complaint assigned to you stays open, it will show up here.</p></Card>
      ) : (
        groups.map((g) => {
          const rows = reminders.filter((r) => r.urgency === g.urgency);
          if (rows.length === 0) return null;
          return (
            <Card key={g.urgency}>
              <h2 className={`mb-3 font-semibold ${g.urgency === "overdue" ? "text-red-700" : g.urgency === "today" ? "text-amber-700" : "text-slate-700"}`}>
                {g.heading} ({rows.length})
              </h2>
              <ul className="space-y-2 text-sm">
                {rows.map((r) => (
                  <li key={r.id} className="rounded-lg bg-mist px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="mr-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-royal">
                          {REMINDER_KIND_LABELS[r.kind]}
                        </span>
                        <strong>{r.title}</strong>
                      </span>
                      <button className="text-xs font-semibold text-royal" onClick={() => onGo(r.targetTab)}>
                        Open →
                      </button>
                    </div>
                    <p className="mt-1 text-slate-600">{r.detail}</p>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------- admin view

/** Per-teacher task counts for the admin Overview: who still has a
 *  register to take today and who still has scores to enter, so
 *  duties can be followed up. Read-only, from live data. */
export function TeacherTaskCounts({ schoolId }: { schoolId: string }) {
  const base = useWorkspaceBase();
  const [rows, setRows] = useState<TeacherTaskCount[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const term = await fetchCurrentTerm(schoolId);
      setRows(await loadAdminTeacherTaskCounts({ schoolId, term }));
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  if (!loaded) {
    return (
      <Card>
        <h2 className="mb-2 font-semibold">Teacher tasks - who still has duties to do</h2>
        <p className="text-sm text-slate-500">Loading…</p>
      </Card>
    );
  }
  const outstanding = rows.filter((r) => r.registersDueToday > 0 || r.scoreGaps > 0);
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Teacher tasks - who still has duties to do</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No teachers in this school yet.</p>
      ) : outstanding.length === 0 ? (
        <p className="text-sm text-slate-500">
          All caught up - every teacher has taken today&apos;s register and entered this term&apos;s scores for the subjects they teach.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {outstanding.map((r) => (
            <li key={r.teacherId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
              <span>
                <strong>{r.name}</strong>
                <span className="text-slate-600">
                  {" · "}
                  {r.registersDueToday > 0
                    ? `${r.registersDueToday} register${r.registersDueToday === 1 ? "" : "s"} not taken today`
                    : "Register taken today"}
                  {" · "}
                  {r.scoreGaps > 0
                    ? `${r.scoreGaps} subject${r.scoreGaps === 1 ? "" : "s"} with scores still to enter`
                    : "Scores entered"}
                </span>
              </span>
              <Link href={`${base}/teacher`} className="text-xs font-semibold text-royal">
                View workspace →
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Registers count classes with pupils where no register has been saved for today (Mon-Fri only).
        Score gaps count class + subject pairs where at least one pupil still has no score for the current term.
      </p>
    </Card>
  );
}
