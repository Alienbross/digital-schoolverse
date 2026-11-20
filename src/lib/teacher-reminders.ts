// Teacher reminders (step 3).
//
// Reminders are computed from live saved data only - homework, CBT
// tests, registers, scores, complaints assigned to the teacher and
// weekly summaries. They are read-only: computing them never changes
// a grade, an attendance mark, a fee or any other record.
//
// No email or SMS is sent by this step (in-app reminders only). The
// plug-in point for a daily digest email later is
// sendTeacherDigestEmail() in src/lib/teacher-digest.ts - same shape
// as the absence-email plug-in point in src/lib/absence-emails.ts:
// replace its body with a provider call (Resend / SendGrid) once a
// live email provider is connected. No keys belong in code.
//
// No migration was needed for this step: every table read here
// already exists (0001) and the teacher / admin read access the
// workspace needs already exists (0002 / 0005).

import { supabase } from "@/lib/supabase";
import type { ClassRow, ClassSubject, Student, Term } from "@/lib/types";
import { todayStr } from "@/lib/roles";

export type ReminderKind =
  | "attendance"
  | "scores"
  | "homework"
  | "cbt"
  | "complaint"
  | "weekly-summary";

export type ReminderUrgency = "overdue" | "today" | "soon";

export type TeacherTabTarget =
  | "classes"
  | "attendance"
  | "scores"
  | "homework"
  | "cbt"
  | "complaints";

export type TeacherReminder = {
  id: string;
  kind: ReminderKind;
  urgency: ReminderUrgency;
  title: string;
  detail: string;
  /** Date the item is due, yyyy-mm-dd, when it has one. */
  dueDate: string | null;
  /** Which teacher tab the item opens. */
  targetTab: TeacherTabTarget;
};

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  attendance: "Register",
  scores: "Scores",
  homework: "Homework",
  cbt: "CBT test",
  complaint: "Complaint",
  "weekly-summary": "Weekly summary",
};

export const REMINDER_URGENCY_LABELS: Record<ReminderUrgency, string> = {
  overdue: "Overdue",
  today: "Due today",
  soon: "Due soon",
};

const URGENCY_ORDER: Record<ReminderUrgency, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
};

/** Monday of the week containing `date` (yyyy-mm-dd). Sunday counts
 *  as part of the week that just ended, so it maps to the Monday
 *  before it. */
export function mondayStr(date = todayStr()): string {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay(); // Sun = 0, Mon = 1 ... Sat = 6
  const back = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - back);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** School days (Mon-Fri) from Monday up to `today`, inclusive. */
export function schoolDaysThisWeek(today = todayStr()): string[] {
  const monday = mondayStr(today);
  const days: string[] = [];
  const d = new Date(`${monday}T12:00:00`);
  const end = new Date(`${today}T12:00:00`);
  while (d <= end && d.getDay() >= 1 && d.getDay() <= 5) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push(`${d.getFullYear()}-${m}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** How a due date reads against today.
 *  Overdue: due before today. Today: due today. Soon: due within
 *  the next 7 days. Further out: null (not a reminder yet). */
export function classifyDue(
  dueDate: string | null,
  today = todayStr(),
): ReminderUrgency | null {
  if (!dueDate) return null;
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + 7);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const soonUntil = `${d.getFullYear()}-${m}-${dd}`;
  return dueDate <= soonUntil ? "soon" : null;
}

/** Sort: overdue first, then due today, then due soon; inside a
 *  group by due date, then title. */
export function sortReminders(list: TeacherReminder[]): TeacherReminder[] {
  return [...list].sort((a, b) => {
    const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (u !== 0) return u;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate)
      return a.dueDate < b.dueDate ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function countNeedingAttentionToday(list: TeacherReminder[]): number {
  return list.filter((r) => r.urgency === "overdue" || r.urgency === "today")
    .length;
}

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Load every reminder for one teacher, from live data.
 *
 * Rules (each one is in the report too):
 * - Register: for each of the teacher's classes with pupils, every
 *   Mon-Fri day this week up to today with no register rows saved
 *   yet. A missed day before today is Overdue; today is Due today.
 *   Weekends raise no register reminder.
 * - Scores: for each class + subject the teacher teaches, pupils in
 *   that class with no score row for the current term yet. One
 *   reminder per class + subject, urgency Due soon (no fixed due
 *   date - it follows the term). No current term means no score
 *   reminders.
 * - Homework: Active homework the teacher set. Due before today is
 *   Overdue, due today is Due today, due within 7 days is Due soon.
 *   Homework with no due date is skipped.
 * - CBT: Published tests for the teacher's classes. Same due-date
 *   rule as homework. Draft tests and tests with no due date are
 *   skipped.
 * - Complaints: assigned to this teacher (assignee) and still Open
 *   or In progress. Urgent priority is Due today, everything else
 *   is Due soon.
 * - Weekly summary: for each class where the teacher is class
 *   teacher, if no summary has been Shared for this week's Monday
 *   yet, one Due soon reminder. Summaries are shared from the
 *   school office, so the reminder opens the class list.
 */
export async function loadTeacherReminders(args: {
  schoolId: string;
  teacherId: string;
  myClasses: ClassRow[];
  myClassIds: string[];
  classSubjects: ClassSubject[];
  students: Student[];
  term: Term | null;
  subjectName: (id: string | null) => string;
}): Promise<TeacherReminder[]> {
  const { schoolId, teacherId, myClasses, myClassIds, classSubjects, students, term, subjectName } = args;
  const today = todayStr();
  const reminders: TeacherReminder[] = [];
  if (myClassIds.length === 0) return reminders;

  const pupilsOf = (classId: string) =>
    students.filter((s) => s.class_id === classId);
  const className = (id: string) =>
    myClasses.find((c) => c.id === id)?.name ?? "-";

  // --- registers not taken -------------------------------------------
  const weekDays = schoolDaysThisWeek(today);
  if (weekDays.length > 0) {
    const { data: att } = await supabase
      .from("attendance_records")
      .select("class_id, record_date")
      .eq("school_id", schoolId)
      .in("class_id", myClassIds)
      .gte("record_date", weekDays[0])
      .lte("record_date", today);
    const taken = new Set<string>();
    for (const r of (att as { class_id: string; record_date: string }[] | null) ?? [])
      taken.add(`${r.class_id}|${r.record_date}`);
    for (const c of myClasses) {
      if (pupilsOf(c.id).length === 0) continue;
      for (const day of weekDays) {
        if (taken.has(`${c.id}|${day}`)) continue;
        reminders.push({
          id: `att-${c.id}-${day}`,
          kind: "attendance",
          urgency: day < today ? "overdue" : "today",
          title: `Register not taken - ${c.name}`,
          detail: `${fmtDate(day)} · ${pupilsOf(c.id).length} pupil${pupilsOf(c.id).length === 1 ? "" : "s"} in the class`,
          dueDate: day,
          targetTab: "attendance",
        });
      }
    }
  }

  // --- scores not entered --------------------------------------------
  if (term) {
    const { data: scores } = await supabase
      .from("score_records")
      .select("student_id, subject_id, class_id")
      .eq("school_id", schoolId)
      .eq("term_id", term.id)
      .in("class_id", myClassIds);
    const scored = new Set<string>();
    for (const r of (scores as { student_id: string; subject_id: string; class_id: string }[] | null) ?? [])
      scored.add(`${r.class_id}|${r.subject_id}|${r.student_id}`);
    const myPairs = classSubjects.filter((cs) => cs.teacher_id === teacherId);
    for (const cs of myPairs) {
      const pupils = pupilsOf(cs.class_id);
      if (pupils.length === 0) continue;
      const missing = pupils.filter(
        (p) => !scored.has(`${cs.class_id}|${cs.subject_id}|${p.id}`),
      );
      if (missing.length === 0) continue;
      reminders.push({
        id: `scores-${cs.class_id}-${cs.subject_id}`,
        kind: "scores",
        urgency: "soon",
        title: `Scores not entered - ${subjectName(cs.subject_id)} (${className(cs.class_id)})`,
        detail: `${missing.length} of ${pupils.length} pupil${pupils.length === 1 ? "" : "s"} still have no ${term.name} score for this subject`,
        dueDate: null,
        targetTab: "scores",
      });
    }
  }

  // --- homework due ---------------------------------------------------
  const { data: hw } = await supabase
    .from("homework_assignments")
    .select("id, title, due_date, class_id, subject_id")
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherId)
    .eq("status", "Active")
    .order("due_date", { ascending: true });
  for (const h of (hw as { id: string; title: string; due_date: string | null; class_id: string; subject_id: string | null }[] | null) ?? []) {
    const urgency = classifyDue(h.due_date, today);
    if (!urgency) continue;
    reminders.push({
      id: `hw-${h.id}`,
      kind: "homework",
      urgency,
      title: `Homework ${urgency === "overdue" ? "overdue" : urgency === "today" ? "due today" : "due soon"} - ${h.title}`,
      detail: `${className(h.class_id)} · ${h.subject_id ? subjectName(h.subject_id) : "General"} · Due ${h.due_date ? fmtDate(h.due_date) : "-"}`,
      dueDate: h.due_date,
      targetTab: "homework",
    });
  }

  // --- CBT tests due --------------------------------------------------
  const { data: tests } = await supabase
    .from("cbt_tests")
    .select("id, title, due_date, class_id, subject_id")
    .eq("school_id", schoolId)
    .in("class_id", myClassIds)
    .eq("status", "Published")
    .order("due_date", { ascending: true });
  for (const t of (tests as { id: string; title: string; due_date: string | null; class_id: string; subject_id: string | null }[] | null) ?? []) {
    const urgency = classifyDue(t.due_date, today);
    if (!urgency) continue;
    reminders.push({
      id: `cbt-${t.id}`,
      kind: "cbt",
      urgency,
      title: `CBT test ${urgency === "overdue" ? "overdue" : urgency === "today" ? "due today" : "due soon"} - ${t.title}`,
      detail: `${className(t.class_id)} · ${t.subject_id ? subjectName(t.subject_id) : "General"} · Due ${t.due_date ? fmtDate(t.due_date) : "-"}`,
      dueDate: t.due_date,
      targetTab: "cbt",
    });
  }

  // --- complaints assigned to me, still open --------------------------
  const { data: comp } = await supabase
    .from("complaints")
    .select("id, reference, subject, category, priority, status, created_at")
    .eq("school_id", schoolId)
    .eq("assignee_id", teacherId)
    .in("status", ["Open", "In progress"])
    .order("created_at", { ascending: true });
  for (const c of (comp as { id: string; reference: string; subject: string | null; category: string; priority: string; status: string; created_at: string }[] | null) ?? []) {
    reminders.push({
      id: `comp-${c.id}`,
      kind: "complaint",
      urgency: c.priority === "Urgent" ? "today" : "soon",
      title: `${c.reference} - ${c.subject || c.category} (${c.status})`,
      detail: `${c.category} · Priority ${c.priority} · Raised ${new Date(c.created_at).toLocaleDateString()}`,
      dueDate: null,
      targetTab: "complaints",
    });
  }

  // --- weekly summaries not shared yet --------------------------------
  const monday = mondayStr(today);
  const formClasses = myClasses.filter((c) => c.class_teacher_id === teacherId);
  if (formClasses.length > 0) {
    const pupilIds = formClasses.flatMap((c) => pupilsOf(c.id).map((p) => p.id));
    if (pupilIds.length > 0) {
      const { data: sums } = await supabase
        .from("weekly_summaries")
        .select("student_id")
        .eq("school_id", schoolId)
        .eq("week_start", monday)
        .eq("status", "Shared")
        .in("student_id", pupilIds);
      const shared = new Set(
        ((sums as { student_id: string }[] | null) ?? []).map((s) => s.student_id),
      );
      for (const c of formClasses) {
        const pupils = pupilsOf(c.id);
        if (pupils.length === 0) continue;
        if (pupils.some((p) => shared.has(p.id))) continue;
        reminders.push({
          id: `weekly-${c.id}-${monday}`,
          kind: "weekly-summary",
          urgency: "soon",
          title: `Weekly summaries not shared yet - ${c.name}`,
          detail: `No summary has been shared for the week starting ${fmtDate(monday)} · ${pupils.length} pupil${pupils.length === 1 ? "" : "s"} in the class · Summaries are shared from the school office`,
          dueDate: null,
          targetTab: "classes",
        });
      }
    }
  }

  return sortReminders(reminders);
}

// ---------------------------------------------------------------- admin view

export type TeacherTaskCount = {
  teacherId: string;
  name: string;
  registersDueToday: number;
  scoreGaps: number;
};

/**
 * Per-teacher task counts for the admin Overview, from the same live
 * data as the teacher reminders.
 * - registersDueToday: classes the teacher is class teacher of (or
 *   teaches a subject in) with pupils, where no register has been
 *   saved for today. Weekends: 0 - no register is due.
 * - scoreGaps: class + subject pairs the teacher teaches where at
 *   least one pupil still has no score row for the current term.
 *   No current term: 0.
 */
export async function loadAdminTeacherTaskCounts(args: {
  schoolId: string;
  term: Term | null;
}): Promise<TeacherTaskCount[]> {
  const { schoolId, term } = args;
  const today = todayStr();
  const isSchoolDay = (() => {
    const day = new Date(`${today}T12:00:00`).getDay();
    return day >= 1 && day <= 5;
  })();

  const { data: teachers } = await supabase
    .from("teachers")
    .select("id, first_name, last_name")
    .eq("school_id", schoolId)
    .order("last_name");
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, class_teacher_id")
    .eq("school_id", schoolId);
  const { data: cs } = await supabase
    .from("class_subjects")
    .select("class_id, subject_id, teacher_id")
    .eq("school_id", schoolId);
  const { data: students } = await supabase
    .from("students")
    .select("id, class_id")
    .eq("school_id", schoolId);

  const classList = (classes as { id: string; name: string; class_teacher_id: string | null }[] | null) ?? [];
  const csList = (cs as { class_id: string; subject_id: string; teacher_id: string | null }[] | null) ?? [];
  const studentList = (students as { id: string; class_id: string | null }[] | null) ?? [];
  const pupilsIn = (classId: string) =>
    studentList.filter((s) => s.class_id === classId);

  let takenToday = new Set<string>();
  if (isSchoolDay) {
    const { data: att } = await supabase
      .from("attendance_records")
      .select("class_id")
      .eq("school_id", schoolId)
      .eq("record_date", today);
    takenToday = new Set(
      ((att as { class_id: string }[] | null) ?? []).map((r) => r.class_id),
    );
  }

  let scored = new Set<string>();
  if (term) {
    const { data: scores } = await supabase
      .from("score_records")
      .select("student_id, subject_id, class_id")
      .eq("school_id", schoolId)
      .eq("term_id", term.id);
    scored = new Set(
      ((scores as { student_id: string; subject_id: string; class_id: string }[] | null) ?? []).map(
        (r) => `${r.class_id}|${r.subject_id}|${r.student_id}`,
      ),
    );
  }

  return ((teachers as { id: string; first_name: string; last_name: string }[] | null) ?? []).map((t) => {
    const myClassIds = new Set<string>();
    for (const c of classList) if (c.class_teacher_id === t.id) myClassIds.add(c.id);
    for (const row of csList) if (row.teacher_id === t.id) myClassIds.add(row.class_id);
    let registersDueToday = 0;
    if (isSchoolDay) {
      for (const id of myClassIds) {
        if (pupilsIn(id).length > 0 && !takenToday.has(id)) registersDueToday += 1;
      }
    }
    let scoreGaps = 0;
    if (term) {
      for (const row of csList.filter((r) => r.teacher_id === t.id)) {
        const pupils = pupilsIn(row.class_id);
        if (pupils.length === 0) continue;
        if (pupils.some((p) => !scored.has(`${row.class_id}|${row.subject_id}|${p.id}`)))
          scoreGaps += 1;
      }
    }
    return {
      teacherId: t.id,
      name: `${t.first_name} ${t.last_name}`,
      registersDueToday,
      scoreGaps,
    };
  });
}
