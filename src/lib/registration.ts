// Self-registration + approvals (migration 0006).
// Public registration from the school's own URL, phased by the admin
// (teachers, then students, then parents), with approvals:
//   teachers -> school admin only
//   students -> class teacher(s) OR school admin
//   parents  -> school admin OR senior staff (can_approve_parents)
// Self-registered accounts start Pending; the approval RPCs run
// server-side (SECURITY DEFINER) so nobody can approve themselves.

import { supabase } from "@/lib/supabase";
import type {
  NotificationRow,
  ParentChild,
  Profile,
  PupilMatch,
  RegisterRole,
  RegistrationStatus,
} from "@/lib/types";

/** localStorage key for a registration that was created while email
 *  confirmation was still pending: /login finishes it on first
 *  sign-in (same pattern as the invite flow). */
export const PENDING_REGISTRATION_KEY = "dsv-pending-registration";

export type PupilInput =
  | { student_id: string; relationship?: string }
  | {
      first_name: string;
      last_name: string;
      class_id?: string | null;
      relationship?: string;
    };

export type RegistrationInput = {
  schoolId: string;
  role: RegisterRole;
  firstName: string;
  lastName: string;
  phone: string;
  classId?: string | null;
  pupils?: PupilInput[];
};

type RpcResult = { ok: boolean; error?: string; [k: string]: unknown };

async function callRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as RpcResult;
  return row.ok === false
    ? { ok: false, error: row.error ?? "Something went wrong." }
    : { ...row, ok: true };
}

/** Public registration status for a school slug: branding, which
 *  phases are open, and the school's classes. Works signed out. */
export async function fetchRegistrationStatus(
  slug: string,
): Promise<RegistrationStatus | null> {
  const { data, error } = await supabase.rpc("school_registration_status", {
    p_slug: slug,
  });
  if (error || !data) return null;
  const row = data as { ok?: boolean } & RegistrationStatus;
  return row.ok ? row : null;
}

/** Pupil lookup by admission number (parent pairing). */
export async function findPupilByAdmission(
  schoolId: string,
  admissionNo: string,
): Promise<{ pupil: PupilMatch | null; error: string | null }> {
  const { data, error } = await supabase.rpc(
    "school_find_pupil_by_admission",
    { p_school_id: schoolId, p_admission_no: admissionNo.trim() },
  );
  if (error) return { pupil: null, error: error.message };
  const rows = (data as PupilMatch[] | null) ?? [];
  return { pupil: rows[0] ?? null, error: null };
}

/** Pupil lookup by name + class (parent pairing without the number). */
export async function findPupilsByName(
  schoolId: string,
  firstName: string,
  lastName: string,
  classId: string | null,
): Promise<{ pupils: PupilMatch[]; error: string | null }> {
  const { data, error } = await supabase.rpc("school_find_pupils_by_name", {
    p_school_id: schoolId,
    p_first_name: firstName.trim(),
    p_last_name: lastName.trim(),
    p_class_id: classId,
  });
  if (error) return { pupils: [], error: error.message };
  return { pupils: (data as PupilMatch[] | null) ?? [], error: null };
}

/** Finish a self-registration for the signed-in user: creates their
 *  teacher / student / parent row and a Pending profile, plus the
 *  proposed pupil links and notifications. */
export async function registerSelf(
  input: RegistrationInput,
): Promise<RpcResult> {
  return callRpc("register_self", {
    p_school_id: input.schoolId,
    p_role: input.role,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_phone: input.phone.trim() || null,
    p_class_id: input.classId ?? null,
    p_pupils: (input.pupils ?? []) as unknown as Record<string, unknown>[],
  });
}

/** Approve or reject a Pending profile. The RPC decides whether the
 *  signed-in user may decide this account. */
export async function decideRegistration(
  profileId: string,
  approve: boolean,
  reason: string,
): Promise<RpcResult> {
  return callRpc("decide_registration", {
    p_profile_id: profileId,
    p_approve: approve,
    p_reason: reason.trim() || null,
  });
}

/** Approve or reject one proposed parent–child link. */
export async function decidePupilLink(
  linkId: string,
  approve: boolean,
  reason: string,
): Promise<RpcResult> {
  return callRpc("decide_pupil_link", {
    p_link_id: linkId,
    p_approve: approve,
    p_reason: reason.trim() || null,
  });
}

/** A parent adds another pupil under them. The link starts Pending
 *  and the admin + class teacher are notified. */
export async function addPupilLink(
  parentId: string,
  studentId: string,
  relationship: string,
): Promise<RpcResult> {
  return callRpc("add_pupil_link", {
    p_parent_id: parentId,
    p_student_id: studentId,
    p_relationship: relationship.trim() || null,
  });
}

/** Pending profiles in this school that the signed-in user may see
 *  (RLS in migration 0006 limits this to what they may decide). */
export async function fetchPendingProfiles(
  schoolId: string,
): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("school_id", schoolId)
    .eq("status", "Pending")
    .order("created_at", { ascending: true });
  return (data as Profile[] | null) ?? [];
}

/** Proposed (Pending) parent–child links in this school, with the
 *  parent and pupil names attached for the approvals list. */
export type PendingLink = ParentChild & {
  parent_name: string;
  student_name: string;
  admission_no: string;
  class_name: string | null;
  class_id: string | null;
};

export async function fetchPendingLinks(
  schoolId: string,
): Promise<PendingLink[]> {
  const { data } = await supabase
    .from("parent_children")
    .select(
      "*, parents!inner(first_name, last_name, school_id), students!inner(first_name, last_name, admission_no, class_id, classes(name))",
    )
    .eq("status", "Pending")
    .eq("parents.school_id", schoolId)
    .order("created_at", { ascending: true });
  const rows = (data as
    | {
        id: string;
        parent_id: string;
        student_id: string;
        relationship: string | null;
        status: string;
        parents: { first_name: string; last_name: string };
        students: {
          first_name: string;
          last_name: string;
          admission_no: string;
          class_id: string | null;
          classes: { name: string } | null;
        };
      }[]
    | null) ?? [];
  return rows.map((r) => ({
    id: r.id,
    parent_id: r.parent_id,
    student_id: r.student_id,
    relationship: r.relationship,
    status: r.status,
    parent_name: `${r.parents.first_name} ${r.parents.last_name}`,
    student_name: `${r.students.first_name} ${r.students.last_name}`,
    admission_no: r.students.admission_no,
    class_name: r.students.classes?.name ?? null,
    class_id: r.students.class_id,
  }));
}

/** The signed-in user's notifications, newest first. */
export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  return (data as NotificationRow[] | null) ?? [];
}

/** Mark notifications read. */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase.from("notifications").update({ is_read: true }).in("id", ids);
}
