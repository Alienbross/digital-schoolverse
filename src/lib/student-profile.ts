// Student summary and profiling (step 4).
//
// A per-pupil "Student Profile" pulls together everything already
// saved about that pupil - attendance, scores, fees, homework, CBT,
// clinic, discipline, complaints, bus, weekly summaries - and turns
// it into a plain-language analysed summary: strengths, concerns
// and suggested next steps. It never changes a grade, an attendance
// mark or a fee - it only reads.
//
// Behaviour indicator: a simple, transparent score out of 100.
// It starts at 100 and every deduction is shown as a line item, so
// a counsellor, teacher, parent or admin can see exactly how the
// number was reached - there is no hidden black-box number.
//   - Discipline record this term: -10 each, max -30
//   - Absence this term: -3 each, max -15
//   - Late this term: -1 each, max -5
//   - Open complaint about the pupil: -5 each, max -10
// Bands: 90-100 Excellent, 75-89 Good, 60-74 Needs attention,
// below 60 Concern - follow up.
// Clinic visits are NOT part of the behaviour score - a child being
// unwell is health, not behaviour - but they are shown on the
// profile so a counsellor sees the full picture.
//
// Thresholds used by the analysed summary (all shown on the page):
//   - Attendance: below 80% concern, 80-89% watch, 95%+ strength
//   - Average score: 70+ strength, below 50 concern
//   - Any subject total below 40: concern (weakest subject named)
//   - Discipline: 2+ records concern, 1 record watch
//   - Fee balance owing: concern (amount shown)
//   - Overdue homework (set for the class, due before today): concern
//   - CBT average below 50: concern, 70+ strength
//   - Attendance pattern: a weekday with 2+ absences is named
//     (e.g. "absent most often on Mondays"), 3+ late marks are named.

import { supabase } from "@/lib/supabase";
import { gradeFor } from "@/components/report-card";
import { loadDomainRatings, type DomainRatings } from "@/lib/assessments";
import type { ClassRow, School, Student, Term } from "@/lib/types";

export type BehaviourBand = "Excellent" | "Good" | "Needs attention" | "Concern";

export type BehaviourDeduction = {
  label: string;
  points: number; // negative
};

export type SubjectSummary = {
  subject: string;
  test: number | null;
  assignment: number | null;
  exam: number | null;
  total: number;
  grade: string;
  remark: string | null;
};

export type StudentProfileData = {
  student: Student;
  school: School | null;
  className: string;
  term: Term | null;
  // Attendance (current term)
  attTotal: number;
  attPresent: number;
  attLate: number;
  attAbsent: number;
  attExcused: number;
  attPct: number | null; // present + late over total, as % attended
  attPattern: string | null; // e.g. "Absent most often on Mondays (3)"
  attReasons: { date: string; reason: string }[];
  // Scores (current term)
  subjects: SubjectSummary[];
  average: number | null;
  classPosition: number | null;
  classPositionOf: number | null;
  strongest: string | null;
  weakest: string | null;
  // Affective & psychomotor (current term, migration 0012)
  domains: { affective: DomainRatings; psychomotor: DomainRatings };
  // Fees (current term)
  feeBilled: number;
  feePaid: number;
  feeBalance: number;
  // Homework (class, current term, Active)
  homeworkSet: number;
  homeworkOverdue: { title: string; subject: string; dueDate: string }[];
  // CBT (this term)
  cbtAttempts: { title: string; subject: string; percentage: number | null; grade: string | null; mode: string }[];
  cbtAverage: number | null;
  // Clinic + discipline (current term)
  clinicVisits: { date: string; complaint: string; outcome: string; attendedBy: string | null }[];
  clinicSentHome: number;
  clinicReferred: number;
  discipline: { date: string; category: string; description: string | null; actionTaken: string | null; parentInformed: boolean }[];
  // Complaints (about this pupil, current term)
  complaintsOpen: number;
  complaintsResolved: number;
  complaints: { reference: string; category: string; status: string; subject: string | null }[];
  // Bus + weekly summaries
  busRoute: string | null;
  busPickup: string | null;
  busDropoff: string | null;
  weeklySummariesShared: number;
  // Linked parents (for the share panel)
  parents: { id: string; name: string; email: string | null; phone: string | null }[];
};

export type StudentProfileAnalysis = {
  behaviourScore: number;
  behaviourBand: BehaviourBand;
  deductions: BehaviourDeduction[];
  strengths: string[];
  concerns: string[];
  watch: string[];
  nextSteps: string[];
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayName(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return WEEKDAYS[d.getDay()] ?? dateStr;
}

function behaviourBandFor(score: number): BehaviourBand {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Needs attention";
  return "Concern";
}

/** Pure analysis - no data fetching, so the same rules can be tested
 *  and quoted anywhere the profile is shown. */
export function analyseProfile(d: StudentProfileData): StudentProfileAnalysis {
  const deductions: BehaviourDeduction[] = [];
  if (d.discipline.length > 0) {
    const pts = -Math.min(30, d.discipline.length * 10);
    deductions.push({ label: `${d.discipline.length} discipline record${d.discipline.length === 1 ? "" : "s"} this term`, points: pts });
  }
  if (d.attAbsent > 0) {
    const pts = -Math.min(15, d.attAbsent * 3);
    deductions.push({ label: `${d.attAbsent} absence${d.attAbsent === 1 ? "" : "s"} this term`, points: pts });
  }
  if (d.attLate > 0) {
    const pts = -Math.min(5, d.attLate * 1);
    deductions.push({ label: `${d.attLate} late mark${d.attLate === 1 ? "" : "s"} this term`, points: pts });
  }
  if (d.complaintsOpen > 0) {
    const pts = -Math.min(10, d.complaintsOpen * 5);
    deductions.push({ label: `${d.complaintsOpen} open complaint${d.complaintsOpen === 1 ? "" : "s"} about this pupil`, points: pts });
  }
  const behaviourScore = Math.max(0, 100 + deductions.reduce((s, x) => s + x.points, 0));

  const strengths: string[] = [];
  const concerns: string[] = [];
  const watch: string[] = [];
  const nextSteps: string[] = [];

  // Attendance
  if (d.attPct !== null) {
    if (d.attPct >= 95) strengths.push(`Excellent attendance - ${d.attPct}% this term.`);
    else if (d.attPct < 80) {
      concerns.push(`Attendance is ${d.attPct}% this term - below the 80% mark.`);
      nextSteps.push("Follow up with the parent about attendance - find out what is keeping the pupil away.");
    } else if (d.attPct < 90) watch.push(`Attendance is ${d.attPct}% this term - worth keeping an eye on.`);
    if (d.attPattern) concerns.push(d.attPattern);
    if (d.attLate >= 3) watch.push(`Late ${d.attLate} times this term.`);
  }

  // Academics
  if (d.average !== null) {
    if (d.average >= 70) strengths.push(`Strong academically - ${d.average.toFixed(1)}/100 average this term.`);
    else if (d.average < 50) {
      concerns.push(`Average score is ${d.average.toFixed(1)}/100 this term - below 50.`);
      nextSteps.push("Arrange extra support in the weakest subjects and review progress at the end of next month.");
    }
    if (d.strongest) strengths.push(`Strongest subject: ${d.strongest}.`);
    if (d.weakest) {
      const weakestRow = d.subjects.find((s) => s.subject === d.weakest);
      if (weakestRow && weakestRow.total < 40) {
        concerns.push(`Needs support in ${d.weakest} - ${weakestRow.total}/100 (Grade ${weakestRow.grade}).`);
      }
    }
  } else {
    watch.push("No scores entered for this term yet.");
  }

  // Affective & psychomotor (migration 0012)
  for (const [label, avg] of [
    ["Affective", d.domains.affective.average],
    ["Psychomotor", d.domains.psychomotor.average],
  ] as const) {
    if (avg !== null) {
      if (avg >= 4) strengths.push(`${label} average ${avg.toFixed(1)} / 5 this term - strong.`);
      else if (avg <= 2) concerns.push(`${label} average is ${avg.toFixed(1)} / 5 this term - low.`);
    }
  }

  // CBT
  if (d.cbtAverage !== null) {
    if (d.cbtAverage >= 70) strengths.push(`CBT practice average ${d.cbtAverage.toFixed(0)}% - strong.`);
    else if (d.cbtAverage < 50) concerns.push(`CBT practice average is ${d.cbtAverage.toFixed(0)}% - below 50.`);
  }

  // Homework
  if (d.homeworkOverdue.length > 0) {
    concerns.push(`${d.homeworkOverdue.length} homework task${d.homeworkOverdue.length === 1 ? "" : "s"} overdue.`);
    nextSteps.push("Check with the pupil and parent why homework is overdue - agree a catch-up plan.");
  }

  // Discipline
  if (d.discipline.length >= 2) {
    concerns.push(`${d.discipline.length} discipline records this term.`);
    nextSteps.push("Counsellor to meet the pupil and parent to agree a behaviour plan.");
  } else if (d.discipline.length === 1) {
    watch.push("1 discipline record this term.");
  }
  const notInformed = d.discipline.filter((x) => !x.parentInformed).length;
  if (notInformed > 0) {
    concerns.push(`Parent has not yet been informed about ${notInformed} discipline record${notInformed === 1 ? "" : "s"}.`);
    nextSteps.push("Inform the parent about the outstanding discipline record(s).");
  }

  // Complaints
  if (d.complaintsOpen > 0) {
    concerns.push(`${d.complaintsOpen} complaint${d.complaintsOpen === 1 ? "" : "s"} about this pupil still open.`);
    nextSteps.push("Resolve the open complaint(s) about this pupil and update the parent.");
  }

  // Fees
  if (d.feeBalance > 0) {
    concerns.push(`Fee balance owing: ₦${d.feeBalance.toLocaleString()} this term.`);
    nextSteps.push("Remind the parent of the outstanding fee balance.");
  } else if (d.feeBilled > 0) {
    strengths.push("Fees paid in full this term.");
  }

  // Clinic
  if (d.clinicReferred > 0) {
    watch.push(`${d.clinicReferred} clinic visit${d.clinicReferred === 1 ? "" : "s"} referred to hospital - check the pupil is well.`);
  } else if (d.clinicSentHome > 0) {
    watch.push(`${d.clinicSentHome} clinic visit${d.clinicSentHome === 1 ? "" : "s"} ended with the pupil sent home.`);
  }

  // Bus
  if (d.busRoute) strengths.push(`Uses the school bus - ${d.busRoute}.`);

  if (strengths.length === 0 && concerns.length === 0 && watch.length === 0) {
    watch.push("Not enough saved data yet this term to draw a picture - attendance, scores or other records will fill this in.");
  }
  if (nextSteps.length === 0) {
    nextSteps.push("No urgent follow-up needed - keep the current support in place.");
  }

  return {
    behaviourScore,
    behaviourBand: behaviourBandFor(behaviourScore),
    deductions,
    strengths,
    concerns,
    watch,
    nextSteps,
  };
}

/** One plain-language summary paragraph, used for the share text and
 *  the print/download copy. */
export function profileSummaryText(d: StudentProfileData, a: StudentProfileAnalysis): string {
  const name = `${d.student.first_name} ${d.student.last_name}`;
  const term = d.term ? `${d.term.name} ${d.term.session}` : "this term";
  const lines: string[] = [
    `Student profile summary for ${name} (${d.student.admission_no}, ${d.className}) - ${term}.`,
    `Behaviour: ${a.behaviourScore}/100 (${a.behaviourBand}).`,
    d.attPct !== null ? `Attendance: ${d.attPct}% (${d.attPresent} present, ${d.attLate} late, ${d.attAbsent} absent of ${d.attTotal} register days).` : "Attendance: no register days yet.",
    d.average !== null ? `Average score: ${d.average.toFixed(1)}/100${d.classPosition !== null ? `, ${d.classPosition} of ${d.classPositionOf} in class` : ""}.` : "Average score: no scores yet.",
    d.feeBilled > 0 ? `Fees: billed ₦${d.feeBilled.toLocaleString()}, paid ₦${d.feePaid.toLocaleString()}, balance ₦${d.feeBalance.toLocaleString()}.` : "Fees: no bill this term.",
    `Strengths: ${a.strengths.length > 0 ? a.strengths.join(" ") : "None recorded yet."}`,
    `Concerns: ${a.concerns.length > 0 ? a.concerns.join(" ") : "None."}`,
    `Suggested next steps: ${a.nextSteps.join(" ")}`,
  ];
  return lines.join("\n");
}

/** Load every saved record about one pupil for the current term.
 *  Read-only - this function writes nothing. */
export async function loadStudentProfileData(
  studentId: string
): Promise<StudentProfileData | null> {
  const { data: st } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!st) return null;
  const student = st as Student;

  const { data: sch } = await supabase.from("schools").select("*").eq("id", student.school_id).single();
  const school = (sch as School | null) ?? null;

  const { data: cls } = await supabase
    .from("classes")
    .select("*")
    .eq("id", student.class_id ?? "")
    .maybeSingle();
  const className = (cls as ClassRow | null)?.name ?? "-";

  const { data: terms } = await supabase
    .from("terms")
    .select("*")
    .eq("school_id", student.school_id)
    .eq("is_current", true)
    .limit(1);
  const term = ((terms as Term[] | null) ?? [])[0] ?? null;
  const termId = term?.id ?? null;
  // clinic_visits, discipline_records and weekly_summaries have no
  // term_id column - scope them by the term's dates instead.
  const termStart = term?.start_date ?? null;
  const termEnd = term?.end_date ?? null;

  const today = new Date().toISOString().slice(0, 10);

  const clinicQ = supabase.from("clinic_visits").select("visit_date, complaint, outcome, attended_by").eq("student_id", student.id);
  const discQ = supabase.from("discipline_records").select("incident_date, category, description, action_taken, parent_informed").eq("student_id", student.id);
  const weeklyQ = supabase.from("weekly_summaries").select("id, week_start").eq("student_id", student.id).eq("status", "Shared");
  if (termStart) {
    clinicQ.gte("visit_date", termStart);
    discQ.gte("incident_date", termStart);
    weeklyQ.gte("week_start", termStart);
  }
  if (termEnd) {
    clinicQ.lte("visit_date", termEnd);
    discQ.lte("incident_date", termEnd);
    weeklyQ.lte("week_start", termEnd);
  }

  const [
    attRes,
    scoreRes,
    billsRes,
    paysRes,
    onlineRes,
    hwRes,
    cbtTestsRes,
    clinicRes,
    discRes,
    compRes,
    busRes,
    weeklyRes,
    linksRes,
  ] = await Promise.all([
    supabase.from("attendance_records").select("status, record_date, reason").eq("student_id", student.id).eq("term_id", termId ?? ""),
    supabase.from("score_records").select("*, subjects(name)").eq("student_id", student.id).eq("term_id", termId ?? ""),
    supabase.from("fee_bills").select("amount").eq("student_id", student.id).eq("term_id", termId ?? ""),
    supabase.from("fee_payments").select("amount").eq("student_id", student.id).eq("term_id", termId ?? ""),
    supabase.from("fee_online_payments").select("amount").eq("student_id", student.id).eq("term_id", termId ?? "").eq("status", "Paid"),
    supabase.from("homework_assignments").select("title, due_date, subjects(name)").eq("class_id", student.class_id ?? "").eq("term_id", termId ?? "").eq("status", "Active"),
    supabase.from("cbt_tests").select("id, title, mode, subjects(name)").eq("class_id", student.class_id ?? "").eq("term_id", termId ?? ""),
    clinicQ,
    discQ,
    supabase.from("complaints").select("reference, category, status, subject").eq("student_id", student.id).eq("term_id", termId ?? ""),
    supabase.from("bus_assignments").select("pickup_point, dropoff_point, bus_routes(name)").eq("student_id", student.id).maybeSingle(),
    weeklyQ,
    supabase.from("parent_children").select("parent_id, parents(first_name, last_name, email, phone)").eq("student_id", student.id).eq("status", "Approved"),
  ]);

  // Affective & psychomotor ratings (current term, migration 0012)
  const domains = await loadDomainRatings(student.school_id, student.id, termId);

  // Attendance
  const attRows = (attRes.data ?? []) as { status: string; record_date: string; reason: string | null }[];
  const attTotal = attRows.length;
  const attPresent = attRows.filter((r) => r.status === "Present").length;
  const attLate = attRows.filter((r) => r.status === "Late").length;
  const attAbsent = attRows.filter((r) => r.status === "Absent").length;
  const attExcused = attRows.filter((r) => r.status === "Excused").length;
  const attPct = attTotal > 0 ? Math.round(((attPresent + attLate) / attTotal) * 100) : null;
  const absentByDay: Record<string, number> = {};
  for (const r of attRows.filter((x) => x.status === "Absent")) {
    const day = weekdayName(r.record_date);
    absentByDay[day] = (absentByDay[day] ?? 0) + 1;
  }
  const worstDay = Object.entries(absentByDay).sort((a, b) => b[1] - a[1])[0];
  const attPattern =
    worstDay && worstDay[1] >= 2
      ? `Absent most often on ${worstDay[0]}s (${worstDay[1]} ${worstDay[1] === 1 ? "time" : "times"} this term).`
      : null;
  const attReasons = attRows
    .filter((r) => (r.status === "Absent" || r.status === "Excused") && r.reason)
    .map((r) => ({ date: r.record_date, reason: r.reason as string }));

  // Scores
  const scoreRows = (scoreRes.data ?? []) as {
    test_score: number | null;
    assignment_score: number | null;
    exam_score: number | null;
    remark: string | null;
    subjects: { name: string } | null;
  }[];
  const subjects: SubjectSummary[] = scoreRows
    .map((r) => {
      const total = (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
      return {
        subject: r.subjects?.name ?? "-",
        test: r.test_score,
        assignment: r.assignment_score,
        exam: r.exam_score,
        total,
        grade: gradeFor(total),
        remark: r.remark,
      };
    })
    .sort((a, b) => b.total - a.total);
  const average = subjects.length > 0 ? subjects.reduce((s, r) => s + r.total, 0) / subjects.length : null;
  const strongest = subjects.length > 0 ? subjects[0].subject : null;
  const weakest = subjects.length > 0 ? subjects[subjects.length - 1].subject : null;

  // Class position (average per pupil in the same class this term)
  let classPosition: number | null = null;
  let classPositionOf: number | null = null;
  if (student.class_id && termId && average !== null) {
    const { data: classmates } = await supabase.from("students").select("id").eq("class_id", student.class_id);
    const ids = ((classmates as { id: string }[] | null) ?? []).map((c) => c.id);
    if (ids.length > 0) {
      const { data: classScores } = await supabase
        .from("score_records")
        .select("student_id, test_score, assignment_score, exam_score")
        .in("student_id", ids)
        .eq("term_id", termId);
      const byPupil: Record<string, number[]> = {};
      for (const r of (classScores ?? []) as { student_id: string; test_score: number | null; assignment_score: number | null; exam_score: number | null }[]) {
        (byPupil[r.student_id] = byPupil[r.student_id] ?? []).push(
          (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0)
        );
      }
      const avgs = Object.entries(byPupil)
        .map(([id, totals]) => ({ id, avg: totals.reduce((s, t) => s + t, 0) / totals.length }))
        .sort((a, b) => b.avg - a.avg);
      const pos = avgs.findIndex((x) => x.id === student.id);
      if (pos >= 0) {
        classPosition = pos + 1;
        classPositionOf = avgs.length;
      }
    }
  }

  // Fees
  const feeBilled = ((billsRes.data as { amount: number }[] | null) ?? []).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const feePaid =
    ((paysRes.data as { amount: number }[] | null) ?? []).reduce((s, b) => s + Number(b.amount ?? 0), 0) +
    ((onlineRes.data as { amount: number }[] | null) ?? []).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const feeBalance = Math.max(0, feeBilled - feePaid);

  // Homework
  const hwRows = (hwRes.data as unknown as { title: string; due_date: string | null; subjects: { name: string } | null }[]) ?? [];
  const homeworkOverdue = hwRows
    .filter((h) => h.due_date && h.due_date < today)
    .map((h) => ({ title: h.title, subject: h.subjects?.name ?? "-", dueDate: h.due_date as string }));

  // CBT attempts
  const cbtTests = (cbtTestsRes.data as unknown as { id: string; title: string; mode: string; subjects: { name: string } | null }[]) ?? [];
  let cbtAttempts: StudentProfileData["cbtAttempts"] = [];
  let cbtAverage: number | null = null;
  if (cbtTests.length > 0) {
    const { data: att } = await supabase
      .from("cbt_attempts")
      .select("test_id, percentage, grade")
      .eq("student_id", student.id)
      .in("test_id", cbtTests.map((t) => t.id));
    const byTest = new Map(cbtTests.map((t) => [t.id, t]));
    const rows = ((att as { test_id: string; percentage: number | null; grade: string | null }[] | null) ?? [])
      .map((a) => {
        const t = byTest.get(a.test_id);
        return { title: t?.title ?? "-", subject: t?.subjects?.name ?? "-", percentage: a.percentage !== null ? Number(a.percentage) : null, grade: a.grade, mode: t?.mode ?? "-" };
      });
    cbtAttempts = rows;
    const pcts = rows.map((r) => r.percentage).filter((p): p is number => p !== null);
    cbtAverage = pcts.length > 0 ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;
  }

  // Clinic + discipline
  const clinicRows = (clinicRes.data ?? []) as { visit_date: string; complaint: string; outcome: string; attended_by: string | null }[];
  const clinicVisits = clinicRows.map((v) => ({ date: v.visit_date, complaint: v.complaint, outcome: v.outcome, attendedBy: v.attended_by }));
  const clinicSentHome = clinicRows.filter((v) => v.outcome === "Sent home").length;
  const clinicReferred = clinicRows.filter((v) => v.outcome === "Referred to hospital").length;
  const discipline = ((discRes.data as { incident_date: string; category: string; description: string | null; action_taken: string | null; parent_informed: boolean }[] | null) ?? []).map(
    (x) => ({ date: x.incident_date, category: x.category, description: x.description, actionTaken: x.action_taken, parentInformed: x.parent_informed })
  );

  // Complaints
  const compRows = (compRes.data ?? []) as { reference: string; category: string; status: string; subject: string | null }[];
  const complaintsOpen = compRows.filter((c) => c.status !== "Resolved").length;
  const complaintsResolved = compRows.filter((c) => c.status === "Resolved").length;

  // Bus
  const bus = busRes.data as { pickup_point: string | null; dropoff_point: string | null; bus_routes: { name: string } | null } | null;

  // Linked parents (Approved links only - same rule as absence emails)
  const parents = ((linksRes.data as { parent_id: string; parents: { first_name: string; last_name: string; email: string | null; phone: string | null } | null }[] | null) ?? [])
    .filter((l) => l.parents)
    .map((l) => ({
      id: l.parent_id,
      name: `${l.parents!.first_name} ${l.parents!.last_name}`,
      email: l.parents!.email,
      phone: l.parents!.phone,
    }));

  return {
    student,
    school,
    className,
    term,
    attTotal,
    attPresent,
    attLate,
    attAbsent,
    attExcused,
    attPct,
    attPattern,
    attReasons,
    subjects,
    average,
    classPosition,
    classPositionOf,
    strongest,
    weakest,
    domains,
    feeBilled,
    feePaid,
    feeBalance,
    homeworkSet: hwRows.length,
    homeworkOverdue,
    cbtAttempts,
    cbtAverage,
    clinicVisits,
    clinicSentHome,
    clinicReferred,
    discipline,
    complaintsOpen,
    complaintsResolved,
    complaints: compRows.map((c) => ({ reference: c.reference, category: c.category, status: c.status, subject: c.subject })),
    busRoute: bus?.bus_routes?.name ?? null,
    busPickup: bus?.pickup_point ?? null,
    busDropoff: bus?.dropoff_point ?? null,
    weeklySummariesShared: (weeklyRes.data ?? []).length,
    parents,
  };
}
