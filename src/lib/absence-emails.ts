// Absence emails to parents (migration 0008).
//
// Flow: a teacher saves a register with a pupil marked Absent (or
// Late) -> queueAbsenceNotices() writes one row per linked parent of
// that pupil into `absence_emails` -> the parent sees the notice in
// their workspace and the admin / teacher see it in the absence log.
//
// No live email provider is connected yet, so nothing here sends a
// real email. New rows are labelled 'Queued - no live email provider
// yet' (or 'Unreachable - no email on record' when the parent has no
// email on file) and are shown in the portal instead. This matches
// how the portal already handles SMS test sends and the fee test
// checkout: record it honestly, never claim a real message left the
// portal.
//
// Plug-in point for a real sender: sendAbsenceEmail() below. When a
// provider such as Resend or SendGrid is connected, replace its body
// with the provider call (to row.parent_email, row.subject,
// row.body), then update the row to status 'Sent' with sent_at and
// provider set. No keys belong in this file - the provider key lives
// in the server env / Supabase secrets, never in code or chat.

import { supabase } from "@/lib/supabase";
import type { AbsenceEmailRow, Parent, Student } from "@/lib/types";

export const ABSENCE_EMAIL_QUEUED = "Queued - no live email provider yet";
export const ABSENCE_EMAIL_UNREACHABLE = "Unreachable - no email on record";
export const ABSENCE_EMAIL_SENT = "Sent";

export type AbsenceKind = "Absent" | "Late";

/** One pupil marked Absent or Late on a saved register. */
export type MarkedPupil = {
  student: Student;
  status: AbsenceKind;
  reason: string | null;
};

/**
 * Build the subject + body of the absence email for one parent.
 * Plain text, hyphen-only copy, no em dashes.
 */
export function buildAbsenceEmail(args: {
  schoolName: string;
  pupilName: string;
  className: string;
  parentFirstName: string;
  recordDate: string;
  kind: AbsenceKind;
  reason: string | null;
}): { subject: string; body: string } {
  const { schoolName, pupilName, className, parentFirstName, recordDate, kind, reason } = args;
  const what =
    kind === "Absent"
      ? "was marked absent from school"
      : "was marked late to school";
  const subject = `${schoolName} - ${pupilName} ${kind === "Absent" ? "absent" : "late"} on ${recordDate}`;
  const body =
    `Dear ${parentFirstName},\n\n` +
    `This is to let you know that ${pupilName} (${className}) ${what} on ${recordDate}.\n\n` +
    `Reason recorded: ${reason && reason.trim() ? reason.trim() : "No reason was recorded - please contact the class teacher if you need to discuss it."}\n\n` +
    `If your child was away for a genuine reason, please let the school know so the record can be updated.\n\n` +
    `Thank you,\n${schoolName}`;
  return { subject, body };
}

/**
 * PLUG-IN POINT for a real email sender.
 *
 * Today this always returns ok: false - no live email provider is
 * connected, so no email is sent and the row stays Queued. When a
 * provider (Resend / SendGrid) is connected:
 *   1. Send row.subject + row.body to row.parent_email via the
 *      provider (server-side call with the provider key from env).
 *   2. On success, update the row: status 'Sent', sent_at now,
 *      provider e.g. 'Resend'.
 *   3. On failure, leave the row Queued and return the error.
 * Do NOT invent keys or connect a provider from this file.
 */
export async function sendAbsenceEmail(
  row: AbsenceEmailRow,
): Promise<{ ok: boolean; error?: string }> {
  void row;
  return {
    ok: false,
    error:
      "No live email provider is connected yet - the notice stays queued in the portal.",
  };
}

/**
 * Queue absence / late notices for the pupils just marked on a saved
 * register. One row per linked parent per pupil. Only Approved pupil
 * links are notified (migration 0006: parent-proposed links still
 * Pending, and Rejected links, are never emailed). Parents with no
 * email on record still get a row, labelled Unreachable, so they show
 * in the log instead of being silently skipped. Re-saving a register
 * upserts the same rows (unique per pupil + parent + date + kind),
 * never duplicates them, and never overwrites a row already Sent.
 * Pupils re-marked Present / Excused have their still-queued notices
 * for that day cleared.
 *
 * Also best-effort: an in-app notification in `notifications`
 * (migration 0006 pattern) for any linked parent who has a login
 * profile. Teachers cannot insert into that table under RLS, so a
 * failure there is ignored - the absence_emails row is the record
 * that matters, and the parent workspace reads it directly.
 */
export async function queueAbsenceNotices(args: {
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  termId: string | null;
  recordDate: string;
  marked: MarkedPupil[];
  presentStudentIds: string[];
}): Promise<{
  queued: number;
  late: number;
  unreachable: number;
  cleared: number;
  error?: string;
}> {
  const { schoolId, schoolName, classId, className, termId, recordDate, marked, presentStudentIds } = args;
  let cleared = 0;

  // Clear still-queued notices for pupils now marked Present / Excused.
  if (presentStudentIds.length > 0) {
    const { data: stale } = await supabase
      .from("absence_emails")
      .select("id")
      .eq("school_id", schoolId)
      .eq("record_date", recordDate)
      .in("student_id", presentStudentIds)
      .neq("status", ABSENCE_EMAIL_SENT);
    const staleIds = ((stale as { id: string }[] | null) ?? []).map((r) => r.id);
    if (staleIds.length > 0) {
      const { error } = await supabase.from("absence_emails").delete().in("id", staleIds);
      if (!error) cleared = staleIds.length;
    }
  }

  if (marked.length === 0) return { queued: 0, late: 0, unreachable: 0, cleared };

  const studentIds = marked.map((m) => m.student.id);
  const { data: linkRows, error: linkError } = await supabase
    .from("parent_children")
    .select("parent_id, student_id, status")
    .in("student_id", studentIds);
  if (linkError) {
    return { queued: 0, late: 0, unreachable: 0, cleared, error: `Could not find linked parents: ${linkError.message}` };
  }
  // Approved links only. A null status is treated as approved: rows
  // created before migration 0006 were admin-made and backfilled to
  // Approved, so null can only come from a legacy row.
  const links = ((linkRows as { parent_id: string; student_id: string; status: string | null }[] | null) ?? []).filter(
    (l) => l.status !== "Pending" && l.status !== "Rejected",
  );
  if (links.length === 0) return { queued: 0, late: 0, unreachable: 0, cleared };

  const parentIds = [...new Set(links.map((l) => l.parent_id))];
  const { data: parentRows, error: parentError } = await supabase
    .from("parents")
    .select("*")
    .in("id", parentIds);
  if (parentError) {
    return { queued: 0, late: 0, unreachable: 0, cleared, error: `Could not load parents: ${parentError.message}` };
  }
  const parentsById = new Map<string, Parent>();
  for (const p of (parentRows as Parent[] | null) ?? []) parentsById.set(p.id, p);

  // Never overwrite a notice already Sent (a live provider sent it).
  const { data: existing } = await supabase
    .from("absence_emails")
    .select("student_id, parent_id, record_date, kind, status")
    .eq("school_id", schoolId)
    .eq("record_date", recordDate)
    .in("student_id", studentIds);
  const sentKeys = new Set(
    ((existing as { student_id: string; parent_id: string; record_date: string; kind: string; status: string }[] | null) ?? [])
      .filter((r) => r.status === ABSENCE_EMAIL_SENT)
      .map((r) => `${r.student_id}|${r.parent_id}|${r.record_date}|${r.kind}`),
  );

  const rows: Record<string, unknown>[] = [];
  let late = 0;
  let unreachable = 0;
  for (const m of marked) {
    const pupilName = `${m.student.first_name} ${m.student.last_name}`;
    for (const link of links.filter((l) => l.student_id === m.student.id)) {
      const parent = parentsById.get(link.parent_id);
      if (!parent) continue;
      if (sentKeys.has(`${m.student.id}|${parent.id}|${recordDate}|${m.status}`)) continue;
      const email = parent.email?.trim() || null;
      if (!email) unreachable += 1;
      if (m.status === "Late") late += 1;
      const { subject, body } = buildAbsenceEmail({
        schoolName,
        pupilName,
        className,
        parentFirstName: parent.first_name,
        recordDate,
        kind: m.status,
        reason: m.reason,
      });
      rows.push({
        school_id: schoolId,
        class_id: classId,
        student_id: m.student.id,
        parent_id: parent.id,
        term_id: termId,
        record_date: recordDate,
        kind: m.status,
        reason: m.reason,
        parent_name: `${parent.first_name} ${parent.last_name}`,
        parent_email: email,
        pupil_name: pupilName,
        subject,
        body,
        status: email ? ABSENCE_EMAIL_QUEUED : ABSENCE_EMAIL_UNREACHABLE,
        provider: null,
      });
    }
  }
  if (rows.length === 0) return { queued: 0, late, unreachable, cleared };

  const { error } = await supabase
    .from("absence_emails")
    .upsert(rows, { onConflict: "student_id,parent_id,record_date,kind" });
  if (error) {
    return { queued: 0, late: 0, unreachable: 0, cleared, error: `Could not queue absence emails: ${error.message}` };
  }

  // Best-effort in-app notification for linked parents with a login.
  // Ignored on failure (teachers cannot insert here under RLS).
  try {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, parent_id")
      .in("parent_id", parentIds);
    const profileByParent = new Map<string, string>();
    for (const p of (profiles as { id: string; parent_id: string | null }[] | null) ?? []) {
      if (p.parent_id) profileByParent.set(p.parent_id, p.id);
    }
    const notes: Record<string, unknown>[] = [];
    for (const m of marked) {
      const pupilName = `${m.student.first_name} ${m.student.last_name}`;
      for (const link of links.filter((l) => l.student_id === m.student.id)) {
        const recipient = profileByParent.get(link.parent_id);
        if (!recipient) continue;
        notes.push({
          school_id: schoolId,
          recipient_id: recipient,
          kind: "absence",
          title: `${pupilName} was marked ${m.status.toLowerCase()} - ${recordDate}`,
          body: m.reason?.trim()
            ? `Reason recorded: ${m.reason.trim()}`
            : "No reason was recorded - contact the class teacher if you need to discuss it.",
          link: "/parent",
        });
      }
    }
    if (notes.length > 0) await supabase.from("notifications").insert(notes);
  } catch {
    // In-app notice is a bonus only; the absence_emails row is the record.
  }

  return { queued: rows.length, late, unreachable, cleared };
}
