// Sickbay and emergency alerts (migration 0024).
//
// Flow: the school admin or a teacher records an event (Sickbay,
// Sent home, or Emergency) for a pupil -> one row is saved in
// `sickbay_events` -> one in-portal notification row per linked
// parent is written into the existing `notifications` table
// (migration 0006 pattern, same insert shape as the absence-email
// best-effort notice in src/lib/absence-emails.ts).
//
// No live SMS provider is connected yet, so no SMS is sent. The
// plug-in point for a real sender is sendSickbaySms() below - same
// shape as sendAbsenceEmail() in src/lib/absence-emails.ts:
// replace its body with a provider call once a live SMS provider is
// connected. No keys belong in this file.
//
// Note on RLS: `notifications` only accepts direct inserts from
// the platform owner or the school admin (migration 0006). Parent
// alerts go through the notify_recipients RPC (migration 0027),
// which any same-school staff member can call, so a teacher's alert
// reaches the parent too. The linked-parent lookup also runs past
// RLS: `profiles` only lets a user read their own row ("profiles
// read own or owner", migration 0002), so a direct client-side
// lookup of other parents' profile rows returns nothing - the
// parent_profile_ids_for_student RPC (migration 0029) resolves
// them instead. A failure is still reported in `notified`
// / `error` instead of failing the whole record.

import { supabase } from "@/lib/supabase";
import { EMAIL_NOT_CONFIGURED, requestEmailSend } from "@/lib/email";

export type SickbayKind = "Sickbay" | "Sent home" | "Emergency";

export const SICKBAY_KINDS: SickbayKind[] = ["Sickbay", "Sent home", "Emergency"];

export type SickbayEvent = {
  id: string;
  school_id: string;
  student_id: string;
  kind: SickbayKind;
  note: string | null;
  recorded_by: string | null;
  recorded_at: string;
  student_name?: string;
  class_name?: string | null;
};

export type SickbayEventRow = {
  id: string;
  school_id: string;
  student_id: string;
  kind: string;
  note: string | null;
  recorded_by: string | null;
  recorded_at: string;
  students: {
    first_name: string;
    last_name: string;
    classes: { name: string } | null;
  } | null;
};

/** Default body when no note was written, per kind. */
export function defaultSickbayBody(kind: SickbayKind, pupilName: string): string {
  if (kind === "Sent home")
    return `${pupilName} was sent home from school. Please contact the school office if you need more detail.`;
  if (kind === "Emergency")
    return `There was an emergency involving ${pupilName} at school. Please contact the school office as soon as possible.`;
  return `${pupilName} was taken to the sickbay at school. Please contact the school office if you need more detail.`;
}

/**
 * PLUG-IN POINT for a live sickbay email - wired to Resend via POST
 * /api/email (see src/lib/email.ts). The in-portal alert above is
 * untouched: email is added on top of it, never instead of it. With
 * no key configured this returns ok: false and nothing is sent.
 * The SMS plug-in point sendSickbaySms() below is unchanged - no SMS
 * provider is connected, and no SMS is sent.
 */
export async function sendSickbayEmail(args: {
  parentEmail: string;
  pupilName: string;
  kind: SickbayKind;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const subject = `${args.kind} alert - ${args.pupilName}`;
  const text =
    `${args.body}\n\n` +
    `Please contact the school office if you need more detail.\n\n` +
    `Digital SchoolVerse`;
  const result = await requestEmailSend({
    kind: "sickbay",
    to: args.parentEmail.trim(),
    subject,
    text,
  });
  if (!result.sent) {
    return { ok: false, error: result.error ?? EMAIL_NOT_CONFIGURED };
  }
  return { ok: true };
}

/**
 * PLUG-IN POINT for a real SMS sender.
 *
 * Today this always returns ok: false - no live SMS provider is
 * connected, so no SMS is sent and the alert stays in-portal only.
 * When a provider is connected:
 *   1. Send the alert text to each linked parent's phone via the
 *      provider (server-side call with the provider key from env).
 *   2. On success, return ok: true.
 *   3. On failure, return ok: false with the error.
 * Do NOT invent keys or connect a provider from this file.
 */
export async function sendSickbaySms(args: {
  parentPhone: string;
  pupilName: string;
  kind: SickbayKind;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  void args;
  return {
    ok: false,
    error:
      "No live SMS provider is connected yet - the alert stays in-portal only.",
  };
}

/**
 * Record a sickbay / sent-home / emergency event and alert the
 * pupil's linked parents in-portal, and by email when live email is
 * connected (sendSickbayEmail() above, Resend via POST /api/email).
 * Only Approved pupil links are notified (migration 0006:
 * parent-proposed links still Pending, and Rejected links, are never
 * notified). Parents with no login profile get no notification row -
 * there is no recipient to write to - but the event itself is still
 * saved, and a parent with an email on file still gets the email.
 * Email never fails the record: a failed send only lowers `emailed`.
 */
export async function recordSickbayEvent(args: {
  schoolId: string;
  studentId: string;
  kind: SickbayKind;
  note: string | null;
  recordedBy: string | null;
}): Promise<{
  ok: boolean;
  eventId: string | null;
  notified: number;
  emailed: number;
  error?: string;
}> {
  const { schoolId, studentId, kind, note, recordedBy } = args;

  const { data: pupil, error: pupilError } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (pupilError || !pupil) {
    return {
      ok: false,
      eventId: null,
      notified: 0,
      emailed: 0,
      error: pupilError?.message ?? "Pupil not found in this school.",
    };
  }
  const pupilName = `${(pupil as { first_name: string; last_name: string }).first_name} ${(pupil as { first_name: string; last_name: string }).last_name}`;

  const { data: event, error: eventError } = await supabase
    .from("sickbay_events")
    .insert({
      school_id: schoolId,
      student_id: studentId,
      kind,
      note: note?.trim() || null,
      recorded_by: recordedBy,
    })
    .select("id")
    .single();
  if (eventError || !event) {
    return {
      ok: false,
      eventId: null,
      notified: 0,
      emailed: 0,
      error: `Could not record the event: ${eventError?.message ?? "unknown error"}`,
    };
  }

  // Linked parents, Approved links only (same rule as absence emails).
  // Resolved inside the parent_profile_ids_for_student RPC
  // (migration 0029): a direct client-side read of `profiles`
  // returns nothing for anyone but the signed-in user, because the
  // profiles table only lets a user read their own row - that is
  // why the alert used to find "no linked parent with a login".
  const { data: recipientRows, error: recipientError } = await supabase.rpc(
    "parent_profile_ids_for_student",
    { p_student_id: studentId }
  );
  const eventId = (event as { id: string }).id;
  if (recipientError) {
    return {
      ok: true,
      eventId,
      notified: 0,
      emailed: 0,
      error: `Event recorded, but the linked parents could not be looked up: ${recipientError.message}`,
    };
  }
  const recipientIds = ((recipientRows as string[] | null) ?? []).filter(Boolean);

  const title =
    kind === "Sickbay"
      ? `Sickbay alert: ${pupilName}`
      : kind === "Sent home"
        ? `Sent home: ${pupilName}`
        : `Emergency alert: ${pupilName}`;
  const body = note?.trim() ? note.trim() : defaultSickbayBody(kind, pupilName);

  // Write via the notify_recipients RPC (migration 0027): a teacher
  // can notify through it, direct inserts are admin-only. A failure
  // here must not undo the event - and must not stop the email below.
  let notified = 0;
  let noteErrorMsg: string | null = null;
  if (recipientIds.length > 0) {
    const { data: nCount, error: noteError } = await supabase.rpc("notify_recipients", {
      p_school_id: schoolId,
      p_recipient_ids: recipientIds,
      p_kind: "sickbay",
      p_title: title,
      p_body: body,
      p_link: "/parent",
    });
    if (noteError) {
      noteErrorMsg = `Event recorded, but the parent alert could not be written in-portal: ${noteError.message}`;
    } else {
      notified = typeof nCount === "number" ? nCount : recipientIds.length;
    }
  }

  // Email on top of the in-portal alert: linked parents with an
  // email on file, Approved links only (same rule as absence
  // emails). Parents without a login profile still get the email -
  // the in-portal row needs a profile, the email only needs an
  // address. No key configured means every send returns ok: false
  // and emailed stays 0 - the event and the in-portal alert are
  // unaffected. A failed send never fails the record.
  let emailed = 0;
  try {
    const { data: linkRows } = await supabase
      .from("parent_children")
      .select("parent_id, status")
      .eq("student_id", studentId);
    const parentIds = [
      ...new Set(
        ((linkRows as { parent_id: string; status: string | null }[] | null) ?? [])
          .filter((l) => l.status !== "Pending" && l.status !== "Rejected")
          .map((l) => l.parent_id),
      ),
    ];
    if (parentIds.length > 0) {
      const { data: parentRows } = await supabase
        .from("parents")
        .select("email")
        .in("id", parentIds);
      const emails = [
        ...new Set(
          ((parentRows as { email: string | null }[] | null) ?? [])
            .map((p) => p.email?.trim())
            .filter((e): e is string => !!e),
        ),
      ];
      for (const parentEmail of emails) {
        try {
          const sent = await sendSickbayEmail({ parentEmail, pupilName, kind, body });
          if (sent.ok) emailed += 1;
        } catch {
          // One failed send must not stop the rest.
        }
      }
    }
  } catch {
    // Email is a bonus only; the event is the record.
  }

  return {
    ok: true,
    eventId,
    notified,
    emailed,
    ...(noteErrorMsg ? { error: noteErrorMsg } : {}),
  };
}

/** Recent sickbay events for a school, newest first, with pupil
 *  and class names attached. */
export async function fetchSickbayEvents(schoolId: string): Promise<SickbayEvent[]> {
  const { data } = await supabase
    .from("sickbay_events")
    .select("*, students(first_name, last_name, classes(name))")
    .eq("school_id", schoolId)
    .order("recorded_at", { ascending: false })
    .limit(50);
  return ((data as SickbayEventRow[] | null) ?? []).map((r) => ({
    id: r.id,
    school_id: r.school_id,
    student_id: r.student_id,
    kind: r.kind as SickbayKind,
    note: r.note,
    recorded_by: r.recorded_by,
    recorded_at: r.recorded_at,
    student_name: r.students
      ? `${r.students.first_name} ${r.students.last_name}`
      : "Unknown pupil",
    class_name: r.students?.classes?.name ?? null,
  }));
}
