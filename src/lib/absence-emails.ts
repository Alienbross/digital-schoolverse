// Absence emails to parents (migration 0008).
//
// Flow: a teacher saves a register with a pupil marked Absent (or
// Late) -> queueAbsenceNotices() writes one row per linked parent of
// that pupil into `absence_emails` -> the parent sees the notice in
// their workspace and the admin / teacher see it in the absence log.
//
// Live email is connected via Resend (POST /api/email, key in the
// RESEND_API_KEY env var). When a register is saved, queueAbsenceNotices()
// writes the rows below and then sends each one with an email on file
// via sendAbsenceEmail(), marking it 'Sent' with provider 'Resend'.
// With no key configured, nothing is sent and rows stay labelled
// 'Queued - no live email provider yet' (or 'Unreachable - no email on
// record' when the parent has no email on file) and are shown in the
// portal instead. This matches how the portal already handles SMS test
// sends and the fee test checkout: record it honestly, never claim a
// real message left the portal.
//
// Plug-in point: sendAbsenceEmail() below. No keys belong in this file
// - the provider key lives in the server env, never in code or chat.

import { supabase } from "@/lib/supabase";
import { EMAIL_NOT_CONFIGURED, requestEmailSend } from "@/lib/email";
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
 * PLUG-IN POINT for a real email sender - now wired to Resend via
 * POST /api/email (see src/lib/email.ts). The key never reaches the
 * browser: this function posts the row to the server route, which
 * sends it with RESEND_API_KEY.
 *
 *   1. No key configured: returns ok: false and the row stays Queued
 *      - in-portal-only behaviour, exactly as before.
 *   2. On success, updates the row: status 'Sent', sent_at now,
 *      provider 'Resend'.
 *   3. On failure, leaves the row Queued and returns the error.
 * A row with no parent email is never sent (Unreachable).
 */
export async function sendAbsenceEmail(
  row: AbsenceEmailRow,
): Promise<{ ok: boolean; error?: string }> {
  if (!row.parent_email?.trim()) {
    return { ok: false, error: "No email on record for this parent." };
  }
  const result = await requestEmailSend({
    kind: "absence",
    to: row.parent_email.trim(),
    subject: row.subject,
    text: row.body,
  });
  if (!result.sent) {
    return { ok: false, error: result.error ?? EMAIL_NOT_CONFIGURED };
  }
  const { error } = await supabase
    .from("absence_emails")
    .update({
      status: ABSENCE_EMAIL_SENT,
      sent_at: new Date().toISOString(),
      provider: "Resend",
    })
    .eq("id", row.id);
  if (error) {
    // The email left the portal, but the row could not be marked
    // Sent - report it so a re-save does not send it twice without
    // anyone knowing. The register save itself is unaffected.
    return { ok: false, error: `Email sent, but the log could not be updated: ${error.message}` };
  }
  return { ok: true };
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

  // Best-effort live send: every row just queued for this register
  // that has a parent email is sent via sendAbsenceEmail() above.
  // No key configured means every send returns ok: false and the
  // rows simply stay Queued - the register save is unaffected, and
  // a failed send never fails the save. Rows already Sent are never
  // re-sent (the sentKeys guard above, plus the status filter here).
  try {
    const { data: queuedRows } = await supabase
      .from("absence_emails")
      .select("*")
      .eq("school_id", schoolId)
      .eq("record_date", recordDate)
      .in("student_id", studentIds)
      .eq("status", ABSENCE_EMAIL_QUEUED)
      .not("parent_email", "is", null);
    for (const r of (queuedRows as AbsenceEmailRow[] | null) ?? []) {
      try {
        await sendAbsenceEmail(r);
      } catch {
        // One failed send must not stop the rest.
      }
    }
  } catch {
    // Sending is a bonus only; the queued rows are the record.
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
