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
// reaches the parent too. A failure is still reported in `notified`
// / `error` instead of failing the whole record.

import { supabase } from "@/lib/supabase";

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
 * pupil's linked parents in-portal. Only Approved pupil links are
 * notified (migration 0006: parent-proposed links still Pending,
 * and Rejected links, are never notified). Parents with no login
 * profile get no notification row - there is no recipient to write
 * to - but the event itself is still saved.
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
      error: `Could not record the event: ${eventError?.message ?? "unknown error"}`,
    };
  }

  // Linked parents, Approved links only (same rule as absence emails).
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
  if (parentIds.length === 0) {
    return { ok: true, eventId: (event as { id: string }).id, notified: 0 };
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, parent_id")
    .in("parent_id", parentIds);
  const profileByParent = new Map<string, string>();
  for (const p of (profiles as { id: string; parent_id: string | null }[] | null) ?? []) {
    if (p.parent_id) profileByParent.set(p.parent_id, p.id);
  }

  const title =
    kind === "Sickbay"
      ? `Sickbay alert: ${pupilName}`
      : kind === "Sent home"
        ? `Sent home: ${pupilName}`
        : `Emergency alert: ${pupilName}`;
  const body = note?.trim() ? note.trim() : defaultSickbayBody(kind, pupilName);
  const recipientIds = parentIds
    .map((parentId) => profileByParent.get(parentId))
    .filter((recipient): recipient is string => Boolean(recipient));
  if (recipientIds.length === 0) {
    return { ok: true, eventId: (event as { id: string }).id, notified: 0 };
  }

  // Write via the notify_recipients RPC (migration 0027): a teacher
  // can notify through it, direct inserts are admin-only. A failure
  // here must not undo the event.
  const { data: nCount, error: noteError } = await supabase.rpc("notify_recipients", {
    p_school_id: schoolId,
    p_recipient_ids: recipientIds,
    p_kind: "sickbay",
    p_title: title,
    p_body: body,
    p_link: "/parent",
  });
  if (noteError) {
    return {
      ok: true,
      eventId: (event as { id: string }).id,
      notified: 0,
      error: `Event recorded, but the parent alert could not be written in-portal: ${noteError.message}`,
    };
  }
  return {
    ok: true,
    eventId: (event as { id: string }).id,
    notified: typeof nCount === "number" ? nCount : recipientIds.length,
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
