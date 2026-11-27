// Plug-in point for a daily teacher-reminder digest email - now
// wired to Resend via POST /api/email (see src/lib/email.ts). The
// key never reaches the browser. With no key configured the route
// answers { sent: false, configured: false } and this returns
// sent: false with a plain message - the in-app reminders are
// unaffected. No keys belong in this file - the provider key lives
// in the server env, never in code or chat.
//
// Same shape as the absence-email plug-in point in
// src/lib/absence-emails.ts.

import type { TeacherReminder } from "@/lib/teacher-reminders";
import { REMINDER_KIND_LABELS, REMINDER_URGENCY_LABELS } from "@/lib/teacher-reminders";
import { EMAIL_NOT_CONFIGURED, requestEmailSend } from "@/lib/email";

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

/** Send one teacher's daily digest email via Resend (POST /api/email).
 *  Returns sent: false with a plain message when no key is configured
 *  or the provider fails - never throws. There is no scheduler yet:
 *  the teacher sends today's digest from the Reminders tab. */
export async function sendTeacherDigestEmail(args: {
  teacherEmail: string;
  teacherName: string;
  schoolName: string;
  reminders: TeacherReminder[];
}): Promise<{ sent: boolean; configured: boolean; error: string | null }> {
  const { subject, body } = buildTeacherDigest(args);
  const result = await requestEmailSend({
    kind: "digest",
    to: args.teacherEmail.trim(),
    subject,
    text: body,
  });
  return {
    sent: result.sent,
    configured: result.configured,
    error: result.sent ? null : (result.error ?? EMAIL_NOT_CONFIGURED),
  };
}
