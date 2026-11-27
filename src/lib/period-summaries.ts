// Weekly and monthly assessment reports to parents (migration
// 0025 for monthly_summaries; weekly_summaries already exists in
// migration 0001 and is NOT recreated here).
//
// Summaries are computed from live saved data only - attendance,
// scores, and domain assessments in the period. Computing them
// never changes a grade, an attendance mark, or any other record.
// A summary starts as Draft and only reaches a parent once it is
// marked Shared.
//
// No email or SMS is sent anywhere here - parents read Shared
// summaries in their own workspace.

import { supabase } from "@/lib/supabase";
import { attendancePct } from "@/lib/roles";
import { mondayStr } from "@/lib/teacher-reminders";

export type SummaryTable = "weekly_summaries" | "monthly_summaries";

export type PeriodSummary = {
  id: string;
  school_id: string;
  student_id: string;
  period_start: string;
  summary_text: string;
  status: string;
  shared_at: string | null;
  created_at: string;
  student_name?: string;
};

export type ParentSummaries = {
  weekly: PeriodSummary[];
  monthly: PeriodSummary[];
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function monthEnd(monthStart: string): string {
  const d = new Date(`${monthStart}T12:00:00`);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const m = String(last.getMonth() + 1).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${last.getFullYear()}-${m}-${dd}`;
}

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Build the plain-text summary for one pupil over one period, from
 * live saved data only:
 * - attendance % from attendance_records in the period,
 * - average score from score_records in the period (Test /20 +
 *   Assignment /10 + Exam /70 totals), with best and weakest
 *   subjects,
 * - domain assessment averages from domain_assessments in the
 *   period (affective and psychomotor, 1-5 scale - see
 *   src/lib/assessments.ts for the table and column names).
 * The text always ends with a strengths line and a weaknesses line.
 */
export async function buildSummaryText(
  studentId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ text: string; studentName: string; schoolId: string | null }> {
  const { data: pupil } = await supabase
    .from("students")
    .select("id, school_id, first_name, last_name")
    .eq("id", studentId)
    .maybeSingle();
  const student = pupil as {
    id: string;
    school_id: string;
    first_name: string;
    last_name: string;
  } | null;
  const studentName = student
    ? `${student.first_name} ${student.last_name}`
    : "This pupil";
  const schoolId = student?.school_id ?? null;

  const rangeEnd = addDays(periodEnd, 1);
  const [{ data: att }, { data: scores }, { data: domains }] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("status")
      .eq("student_id", studentId)
      .gte("record_date", periodStart)
      .lte("record_date", periodEnd),
    supabase
      .from("score_records")
      .select("subject_id, test_score, assignment_score, exam_score, subjects(name)")
      .eq("student_id", studentId)
      .gte("created_at", `${periodStart}T00:00:00`)
      .lt("created_at", `${rangeEnd}T00:00:00`),
    supabase
      .from("domain_assessments")
      .select("domain, trait_name, rating")
      .eq("student_id", studentId)
      .gte("created_at", `${periodStart}T00:00:00`)
      .lt("created_at", `${rangeEnd}T00:00:00`),
  ]);

  const lines: string[] = [];
  lines.push(`${studentName} - ${fmtDate(periodStart)} to ${fmtDate(periodEnd)}`);

  // --- attendance ----------------------------------------------------
  const attRows = (att as { status: string }[] | null) ?? [];
  const attResult = attendancePct(attRows);
  lines.push(
    attResult.pct === null
      ? "Attendance: no register days recorded in this period."
      : `Attendance: ${attResult.pct}% (${attResult.present} of ${attResult.total} school days attended).`,
  );

  // --- scores ----------------------------------------------------------
  const scoreRows = (scores as {
    subject_id: string;
    test_score: number | null;
    assignment_score: number | null;
    exam_score: number | null;
    subjects: { name: string } | null;
  }[] | null) ?? [];
  const bySubject = new Map<string, number[]>();
  for (const r of scoreRows) {
    const total =
      (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
    const name = r.subjects?.name ?? "Unknown subject";
    const cur = bySubject.get(name) ?? [];
    cur.push(total);
    bySubject.set(name, cur);
  }
  const subjectAvgs = [...bySubject.entries()].map(([name, totals]) => ({
    name,
    avg: totals.reduce((s, x) => s + x, 0) / totals.length,
  }));
  subjectAvgs.sort((a, b) => b.avg - a.avg);
  if (subjectAvgs.length === 0) {
    lines.push("Scores: no scores were recorded in this period.");
  } else {
    const overall =
      subjectAvgs.reduce((s, x) => s + x.avg, 0) / subjectAvgs.length;
    lines.push(`Average score: ${Math.round(overall)} out of 100 across ${subjectAvgs.length} subject${subjectAvgs.length === 1 ? "" : "s"}.`);
    lines.push(
      `Best subject: ${subjectAvgs[0].name} (${Math.round(subjectAvgs[0].avg)}).`,
    );
    const weakest = subjectAvgs[subjectAvgs.length - 1];
    lines.push(
      `Weakest subject: ${weakest.name} (${Math.round(weakest.avg)}).`,
    );
  }

  // --- domain assessments ----------------------------------------------
  const domainRows = (domains as {
    domain: string;
    trait_name: string;
    rating: number;
  }[] | null) ?? [];
  for (const domain of ["affective", "psychomotor"] as const) {
    const rows = domainRows.filter((r) => r.domain === domain);
    if (rows.length === 0) continue;
    const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
    const best = [...rows].sort((a, b) => b.rating - a.rating)[0];
    const worst = [...rows].sort((a, b) => a.rating - b.rating)[0];
    const label = domain === "affective" ? "Affective" : "Psychomotor";
    lines.push(
      `${label}: average ${avg.toFixed(1)} out of 5 - strongest in ${best.trait_name}, needs work in ${worst.trait_name}.`,
    );
  }

  // --- strengths and weaknesses -----------------------------------------
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (attResult.pct !== null) {
    if (attResult.pct >= 90) strengths.push("strong attendance");
    else if (attResult.pct < 75) weaknesses.push("attendance below 75%");
  }
  if (subjectAvgs.length > 0) {
    strengths.push(`strongest in ${subjectAvgs[0].name}`);
    const weakest = subjectAvgs[subjectAvgs.length - 1];
    if (weakest.avg < 40) weaknesses.push(`${weakest.name} needs attention`);
  }
  for (const domain of ["affective", "psychomotor"] as const) {
    const rows = domainRows.filter((r) => r.domain === domain);
    if (rows.length === 0) continue;
    const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
    if (avg >= 4) strengths.push(`strong ${domain} ratings`);
    else if (avg < 3) weaknesses.push(`${domain} ratings below 3`);
  }
  lines.push(
    `Strengths: ${strengths.length > 0 ? strengths.join("; ") + "." : "Nothing stands out yet in this period."}`,
  );
  lines.push(
    `Weaknesses: ${weaknesses.length > 0 ? weaknesses.join("; ") + "." : "No clear weakness in this period."}`,
  );

  return { text: lines.join("\n"), studentName, schoolId };
}

/** Generate (or re-generate) the weekly summary for one pupil and
 *  save it as a Draft in weekly_summaries. Re-saving updates the
 *  same row (unique on student + week_start) - never duplicates. */
export async function generateWeeklySummary(
  studentId: string,
  weekStart: string,
): Promise<{ ok: boolean; id: string | null; text: string; error?: string }> {
  const monday = mondayStr(weekStart);
  const weekEnd = addDays(monday, 6);
  const { text, schoolId } = await buildSummaryText(studentId, monday, weekEnd);
  if (!schoolId) {
    return { ok: false, id: null, text, error: "Pupil not found." };
  }
  const { data, error } = await supabase
    .from("weekly_summaries")
    .upsert(
      {
        school_id: schoolId,
        student_id: studentId,
        week_start: monday,
        summary_text: text,
        status: "Draft",
      },
      { onConflict: "student_id,week_start" },
    )
    .select("id")
    .single();
  if (error) {
    return { ok: false, id: null, text, error: `Could not save the weekly summary: ${error.message}` };
  }
  return { ok: true, id: (data as { id: string }).id, text };
}

/** Generate (or re-generate) the monthly summary for one pupil and
 *  save it as a Draft in monthly_summaries. monthStart is the first
 *  day of the month (yyyy-mm-01). */
export async function generateMonthlySummary(
  studentId: string,
  monthStart: string,
): Promise<{ ok: boolean; id: string | null; text: string; error?: string }> {
  const first = monthStart.slice(0, 8) + "01";
  const end = monthEnd(first);
  const { text, schoolId } = await buildSummaryText(studentId, first, end);
  if (!schoolId) {
    return { ok: false, id: null, text, error: "Pupil not found." };
  }
  const { data, error } = await supabase
    .from("monthly_summaries")
    .upsert(
      {
        school_id: schoolId,
        student_id: studentId,
        month_start: first,
        summary_text: text,
        status: "Draft",
      },
      { onConflict: "student_id,month_start" },
    )
    .select("id")
    .single();
  if (error) {
    return { ok: false, id: null, text, error: `Could not save the monthly summary: ${error.message}` };
  }
  return { ok: true, id: (data as { id: string }).id, text };
}

/** Mark a saved summary Shared so the parent can see it. */
export async function shareSummary(
  table: SummaryTable,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from(table)
    .update({ status: "Shared", shared_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: `Could not share the summary: ${error.message}` };
  return { ok: true };
}

/** All Shared weekly and monthly summaries for a parent's linked
 *  children, newest first. */
export async function fetchSummariesForParent(
  parentId: string,
): Promise<ParentSummaries> {
  const empty: ParentSummaries = { weekly: [], monthly: [] };
  if (!parentId) return empty;
  const { data: linkRows } = await supabase
    .from("parent_children")
    .select("student_id, status")
    .eq("parent_id", parentId);
  const childIds = [
    ...new Set(
      ((linkRows as { student_id: string; status: string | null }[] | null) ?? [])
        .filter((l) => l.status !== "Pending" && l.status !== "Rejected")
        .map((l) => l.student_id),
    ),
  ];
  if (childIds.length === 0) return empty;

  const { data: pupils } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .in("id", childIds);
  const nameById = new Map<string, string>();
  for (const p of (pupils as { id: string; first_name: string; last_name: string }[] | null) ?? []) {
    nameById.set(p.id, `${p.first_name} ${p.last_name}`);
  }

  const mapRows = (
    rows: {
      id: string;
      school_id: string;
      student_id: string;
      week_start?: string;
      month_start?: string;
      summary_text: string;
      status: string;
      shared_at: string | null;
      created_at: string;
    }[],
  ): PeriodSummary[] =>
    rows.map((r) => ({
      id: r.id,
      school_id: r.school_id,
      student_id: r.student_id,
      period_start: r.week_start ?? r.month_start ?? "",
      summary_text: r.summary_text,
      status: r.status,
      shared_at: r.shared_at,
      created_at: r.created_at,
      student_name: nameById.get(r.student_id) ?? "My child",
    }));

  const [{ data: weekly }, { data: monthly }] = await Promise.all([
    supabase
      .from("weekly_summaries")
      .select("*")
      .in("student_id", childIds)
      .eq("status", "Shared")
      .order("week_start", { ascending: false }),
    supabase
      .from("monthly_summaries")
      .select("*")
      .in("student_id", childIds)
      .eq("status", "Shared")
      .order("month_start", { ascending: false }),
  ]);
  return {
    weekly: mapRows((weekly as never[] | null) ?? []),
    monthly: mapRows((monthly as never[] | null) ?? []),
  };
}
