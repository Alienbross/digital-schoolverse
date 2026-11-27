// Assignment reminders (migration 0026 for school_holidays;
// homework_assignments already exists in migration 0001 and is NOT
// recreated here).
//
// Rules (agreed with the user):
// - When homework is given, the pupils in the class and their linked
//   parents each get one in-portal notification.
// - Evening reminders only go out on school days: never on Friday,
//   Saturday or Sunday, and never on a public holiday or other date
//   in school_holidays. Those days shift to the next school day.
// - An evening reminder only goes to a pupil with 4 or more active
//   homework tasks due that day or created that day, and only once
//   per pupil per day.
// - Everything here is in-portal notification only. No SMS or email
//   is sent anywhere here.
//
// Note on RLS: `notifications` only accepts direct inserts from the
// platform owner or the school admin (migration 0006). Reminders go
// through the notify_recipients RPC (migration 0027), which any
// same-school staff member can call - the functions report `error`
// when the write fails instead of pretending the reminder went out.
// This is the same pattern as the absence-email notice in
// src/lib/absence-emails.ts.

import { supabase } from "@/lib/supabase";

export type HomeworkAssignmentInput = {
  id?: string;
  school_id: string;
  class_id: string;
  subject_id: string | null;
  teacher_id?: string | null;
  title: string;
  due_date: string | null;
};

export type SchoolHoliday = {
  id: string;
  school_id: string;
  holiday_date: string;
  label: string | null;
  created_at: string;
};

export type EveningReminderResult =
  | { skipped: true; reason: string; reminded?: number }
  | { skipped: false; reminded: number; pupils: number; error?: string };

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** True when the date is a school day: Mon-Fri and not a row in
 *  school_holidays for this school. */
export async function isSchoolDay(
  dateStr: string,
  schoolId: string,
): Promise<boolean> {
  const day = new Date(`${dateStr}T12:00:00`).getDay(); // Sun = 0 ... Sat = 6
  if (day === 0 || day === 6) return false;
  const { data } = await supabase
    .from("school_holidays")
    .select("id")
    .eq("school_id", schoolId)
    .eq("holiday_date", dateStr)
    .limit(1);
  return ((data as { id: string }[] | null) ?? []).length === 0;
}

/** The next school day on or after `dateStr` (Mon-Fri, not a
 *  holiday). Used when a due date or reminder falls on a Friday,
 *  a weekend, or a public holiday. */
export async function nextSchoolDay(
  dateStr: string,
  schoolId: string,
): Promise<string> {
  let d = dateStr;
  for (let i = 0; i < 14; i++) {
    if (await isSchoolDay(d, schoolId)) return d;
    d = nextDay(d);
  }
  return d;
}

/** Map parent ids to their login profile ids, for notification
 *  recipients. Parents with no login profile are skipped. */
async function profileIdsByParent(
  parentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (parentIds.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, parent_id")
    .in("parent_id", parentIds);
  for (const p of (data as { id: string; parent_id: string | null }[] | null) ?? []) {
    if (p.parent_id) map.set(p.parent_id, p.id);
  }
  return map;
}

/** Map pupil ids to their login profile ids. Pupils with no login
 *  profile are skipped. */
async function profileIdsByStudent(
  studentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (studentIds.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, student_id")
    .in("student_id", studentIds);
  for (const p of (data as { id: string; student_id: string | null }[] | null) ?? []) {
    if (p.student_id) map.set(p.student_id, p.id);
  }
  return map;
}

/** Approved linked parents for a set of pupils (migration 0006:
 *  Pending and Rejected links are never notified). */
async function linkedParents(
  studentIds: string[],
): Promise<{ student_id: string; parent_id: string }[]> {
  if (studentIds.length === 0) return [];
  const { data } = await supabase
    .from("parent_children")
    .select("parent_id, student_id, status")
    .in("student_id", studentIds);
  return ((data as { parent_id: string; student_id: string; status: string | null }[] | null) ?? [])
    .filter((l) => l.status !== "Pending" && l.status !== "Rejected")
    .map((l) => ({ student_id: l.student_id, parent_id: l.parent_id }));
}

/**
 * Notify homework given: one in-portal notification per pupil in
 * the class (link /student) and one per linked parent (link
 * /parent). Call this after a homework assignment is saved. The
 * notification title is `New homework: <title>` and the body
 * carries the subject and the due date.
 */
export async function notifyHomeworkGiven(
  assignment: HomeworkAssignmentInput,
): Promise<{ notifiedPupils: number; notifiedParents: number; error?: string }> {
  const { data: pupils } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", assignment.school_id)
    .eq("class_id", assignment.class_id);
  const pupilIds = ((pupils as { id: string }[] | null) ?? []).map((p) => p.id);
  if (pupilIds.length === 0) return { notifiedPupils: 0, notifiedParents: 0 };

  let subjectName = "General";
  if (assignment.subject_id) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", assignment.subject_id)
      .maybeSingle();
    subjectName = (subject as { name: string } | null)?.name ?? "General";
  }
  const body = assignment.due_date
    ? `${subjectName} - due ${fmtDate(assignment.due_date)}.`
    : `${subjectName} - no due date set.`;
  const title = `New homework: ${assignment.title}`;

  const [pupilProfiles, links] = await Promise.all([
    profileIdsByStudent(pupilIds),
    linkedParents(pupilIds),
  ]);
  const parentProfiles = await profileIdsByParent([
    ...new Set(links.map((l) => l.parent_id)),
  ]);

  const pupilRecipients = [...pupilProfiles.values()];
  const parentRecipients = [
    ...new Set(
      links
        .map((l) => parentProfiles.get(l.parent_id))
        .filter((r): r is string => Boolean(r)),
    ),
  ];
  if (pupilRecipients.length === 0 && parentRecipients.length === 0) {
    return { notifiedPupils: 0, notifiedParents: 0 };
  }
  // Write via the notify_recipients RPC (migration 0027): teachers
  // can notify through it, direct inserts are admin-only.
  const [pupilsRes, parentsRes] = await Promise.all([
    pupilRecipients.length > 0
      ? supabase.rpc("notify_recipients", {
          p_school_id: assignment.school_id,
          p_recipient_ids: pupilRecipients,
          p_kind: "homework",
          p_title: title,
          p_body: body,
          p_link: "/student",
        })
      : Promise.resolve({ data: 0, error: null }),
    parentRecipients.length > 0
      ? supabase.rpc("notify_recipients", {
          p_school_id: assignment.school_id,
          p_recipient_ids: parentRecipients,
          p_kind: "homework",
          p_title: title,
          p_body: body,
          p_link: "/parent",
        })
      : Promise.resolve({ data: 0, error: null }),
  ]);
  const error = pupilsRes.error ?? parentsRes.error;
  if (error) {
    return {
      notifiedPupils: 0,
      notifiedParents: 0,
      error: `Homework was saved, but the in-portal alerts could not be written: ${error.message}`,
    };
  }
  return {
    notifiedPupils: typeof pupilsRes.data === "number" ? pupilsRes.data : pupilRecipients.length,
    notifiedParents: typeof parentsRes.data === "number" ? parentsRes.data : parentRecipients.length,
  };
}

/**
 * Evening reminders for one date. If the date is a Friday, Saturday
 * or Sunday, or a row in school_holidays, nothing is created and
 * the call returns { skipped: true, reason }. Otherwise, every
 * pupil with 4 or more active homework tasks due that day or
 * created that day gets one reminder (kind 'homework-evening',
 * title 'Homework reminder: <n> tasks today') to the pupil and one
 * to each linked parent - but only once per pupil per day: a pupil
 * who already has a homework-evening notification created that day
 * is skipped.
 *
 * This is meant to be run once per evening (by the parent wiring it
 * in later, e.g. from a scheduled job or an admin button) - the
 * once-per-day check makes a second run on the same day a no-op.
 */
export async function ensureEveningReminders(
  schoolId: string,
  dateStr: string,
): Promise<EveningReminderResult> {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  if (day === 5) {
    return { skipped: true, reason: "Friday - no reminders on Fridays, they shift to the next school day." };
  }
  if (day === 6 || day === 0) {
    return { skipped: true, reason: "Weekend - no reminders on Saturdays or Sundays." };
  }
  const { data: holiday } = await supabase
    .from("school_holidays")
    .select("id, label")
    .eq("school_id", schoolId)
    .eq("holiday_date", dateStr)
    .limit(1);
  const holidayRow = ((holiday as { id: string; label: string | null }[] | null) ?? [])[0];
  if (holidayRow) {
    return {
      skipped: true,
      reason: `Public holiday${holidayRow.label ? ` (${holidayRow.label})` : ""} - no reminders, they shift to the next school day.`,
    };
  }

  // Active homework due today or created today, per class.
  const { data: hw } = await supabase
    .from("homework_assignments")
    .select("id, class_id, due_date, created_at")
    .eq("school_id", schoolId)
    .eq("status", "Active");
  const dueToday = new Set<string>();
  const createdToday = new Set<string>();
  for (const h of (hw as { id: string; class_id: string; due_date: string | null; created_at: string }[] | null) ?? []) {
    if (h.due_date === dateStr) dueToday.add(h.id);
    if (h.created_at.slice(0, 10) === dateStr) createdToday.add(h.id);
  }
  const relevantIds = [...new Set([...dueToday, ...createdToday])];
  if (relevantIds.length === 0) return { skipped: false, reminded: 0, pupils: 0 };

  const { data: pupils } = await supabase
    .from("students")
    .select("id, class_id")
    .eq("school_id", schoolId);
  const pupilList = (pupils as { id: string; class_id: string | null }[] | null) ?? [];
  const classIds = [...new Set(relevantIds.map((id) => {
    const row = ((hw as { id: string; class_id: string }[] | null) ?? []).find((h) => h.id === id);
    return row?.class_id ?? "";
  }).filter(Boolean))];
  const counts = new Map<string, number>();
  for (const pupil of pupilList) {
    if (!pupil.class_id || !classIds.includes(pupil.class_id)) continue;
    const n = relevantIds.filter((id) => {
      const row = ((hw as { id: string; class_id: string }[] | null) ?? []).find((h) => h.id === id);
      return row?.class_id === pupil.class_id;
    }).length;
    if (n >= 4) counts.set(pupil.id, n);
  }
  if (counts.size === 0) return { skipped: false, reminded: 0, pupils: 0 };

  const pupilIds = [...counts.keys()];
  const [pupilProfiles, links] = await Promise.all([
    profileIdsByStudent(pupilIds),
    linkedParents(pupilIds),
  ]);
  const parentProfiles = await profileIdsByParent([
    ...new Set(links.map((l) => l.parent_id)),
  ]);

  // Once per pupil per day: skip pupils who already have a
  // homework-evening notification created today.
  const { data: sent } = await supabase
    .from("notifications")
    .select("recipient_id")
    .eq("school_id", schoolId)
    .eq("kind", "homework-evening")
    .gte("created_at", `${dateStr}T00:00:00`)
    .lt("created_at", `${nextDay(dateStr)}T00:00:00`);
  const alreadyNotified = new Set(
    ((sent as { recipient_id: string }[] | null) ?? []).map((r) => r.recipient_id),
  );

  // One RPC call per pupil (the title carries that pupil's task
  // count). The RPC (migration 0027) lets teachers notify through
  // it; direct inserts are admin-only.
  const jobs: { pupilId: string; title: string; body: string; recipients: string[] }[] = [];
  let reminded = 0;
  for (const pupilId of pupilIds) {
    const n = counts.get(pupilId) ?? 0;
    const pupilRecipient = pupilProfiles.get(pupilId);
    const parentRecipients = links
      .filter((l) => l.student_id === pupilId)
      .map((l) => parentProfiles.get(l.parent_id))
      .filter((r): r is string => Boolean(r));
    // Skip the pupil entirely when they (or all their parents)
    // already got today's evening reminder.
    const recipients = [pupilRecipient, ...parentRecipients].filter(
      (r): r is string => Boolean(r),
    );
    if (recipients.length === 0) continue;
    if (recipients.every((r) => alreadyNotified.has(r))) continue;
    reminded += 1;
    const title = `Homework reminder: ${n} tasks today`;
    const body = `You have ${n} homework tasks due or given today (${fmtDate(dateStr)}). Check them in your workspace before tomorrow.`;
    jobs.push({
      pupilId,
      title,
      body,
      recipients: recipients.filter((r) => !alreadyNotified.has(r)),
    });
  }
  if (jobs.length === 0) return { skipped: false, reminded, pupils: counts.size };
  const results = await Promise.all(
    jobs.map(async (job) => {
      const pupilRecipient = pupilProfiles.get(job.pupilId);
      const pupilIds2 = job.recipients.filter((r) => r === pupilRecipient);
      const parentIds2 = job.recipients.filter((r) => r !== pupilRecipient);
      const [a, b] = await Promise.all([
        pupilIds2.length > 0
          ? supabase.rpc("notify_recipients", {
              p_school_id: schoolId,
              p_recipient_ids: pupilIds2,
              p_kind: "homework-evening",
              p_title: job.title,
              p_body: job.body,
              p_link: "/student",
            })
          : Promise.resolve({ data: 0, error: null }),
        parentIds2.length > 0
          ? supabase.rpc("notify_recipients", {
              p_school_id: schoolId,
              p_recipient_ids: parentIds2,
              p_kind: "homework-evening",
              p_title: job.title,
              p_body: job.body,
              p_link: "/parent",
            })
          : Promise.resolve({ data: 0, error: null }),
      ]);
      return a.error ?? b.error;
    }),
  );
  const firstError = results.find((e) => e);
  if (firstError) {
    return {
      skipped: false,
      reminded: 0,
      pupils: counts.size,
      error: `Evening reminders could not be written in-portal: ${firstError.message}`,
    };
  }
  return { skipped: false, reminded, pupils: counts.size };
}

// ---------------------------------------------------------------- holidays

/** All holidays for a school, soonest first. */
export async function fetchSchoolHolidays(schoolId: string): Promise<SchoolHoliday[]> {
  const { data } = await supabase
    .from("school_holidays")
    .select("*")
    .eq("school_id", schoolId)
    .order("holiday_date", { ascending: true });
  return (data as SchoolHoliday[] | null) ?? [];
}

/** Add one holiday date (label optional). */
export async function addSchoolHoliday(
  schoolId: string,
  holidayDate: string,
  label: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("school_holidays").insert({
    school_id: schoolId,
    holiday_date: holidayDate,
    label: label?.trim() || null,
  });
  if (error) return { ok: false, error: `Could not add the holiday: ${error.message}` };
  return { ok: true };
}

/** Remove one holiday date. */
export async function deleteSchoolHoliday(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("school_holidays").delete().eq("id", id);
  if (error) return { ok: false, error: `Could not remove the holiday: ${error.message}` };
  return { ok: true };
}
