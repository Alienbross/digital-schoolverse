// Plug-in point for a daily teacher-reminder digest email.
//
// Nothing in this file sends a real email yet - there is no live
// email provider connected. When one is connected (Resend or
// SendGrid), replace the body of sendTeacherDigestEmail() with the
// provider call (to teacher.email, subject + plain-text body built
// from the reminders list), then log the send. No keys belong in
// this file - the provider key lives in the server env / Supabase
// secrets, never in code or chat.
//
// Same shape as the absence-email plug-in point in
// src/lib/absence-emails.ts.

import type { TeacherReminder } from "@/lib/teacher-reminders";
import { REMINDER_KIND_LABELS, REMINDER_URGENCY_LABELS } from "@/lib/teacher-reminders";

/** Build the subject + plain-text body of a teacher's daily digest
 *  from the reminders list. Pure - safe to call anywhere. */
export function buildTeacherDigest(args: {
  teacherName: string;
  schoolName: string;
  reminders: TeacherReminder[];
}): { subject: string; body: string } {
  const { teacherName, schoolName, reminders } = args;
  const needing = reminders.filter(
    (r) => r.urgency === "overdue" || r.urgency === "today",
  ).length;
  const subject = `Digital SchoolVerse - ${needing} task${needing === 1 ? "" : "s"} need${needing === 1 ? "s" : ""} your attention today`;
  const lines = reminders.map(
    (r) =>
      `- [${REMINDER_URGENCY_LABELS[r.urgency]}] ${REMINDER_KIND_LABELS[r.kind]}: ${r.title} - ${r.detail}`,
  );
  const body = [
    `Good morning ${teacherName},`,
    ``,
    `Here is your Digital SchoolVerse reminder list for ${schoolName}:`,
    ``,
    ...(lines.length > 0 ? lines : ["Nothing needs your attention today - well done."]),
    ``,
    `Open your teacher workspace to deal with each item.`,
    `Digital SchoolVerse`,
  ].join("\n");
  return { subject, body };
}

/** Send one teacher's daily digest email. Not wired to any provider
 *  yet - it throws a clear error instead of pretending to send. */
export async function sendTeacherDigestEmail(args: {
  teacherEmail: string;
  teacherName: string;
  schoolName: string;
  reminders: TeacherReminder[];
}): Promise<{ sent: boolean; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { subject, body } = buildTeacherDigest(args);
  return {
    sent: false,
    error:
      "No live email provider is connected yet - connect Resend or SendGrid and replace sendTeacherDigestEmail() with the provider call.",
  };
}
