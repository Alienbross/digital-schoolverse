// Admissions (migration 0007): public apply form + admin review.
// Public submit goes through the SECURITY DEFINER RPC
// `submit_admission_application`, so the form never writes the
// admission_applications table directly. Document files go to the
// private `admission-documents` bucket (anon may upload; only the
// platform owner / that school's school_admin may read them, through
// a signed URL). The checkout is a TEST checkout only - same pattern
// as the parent fee payment: it records a test reference, no real
// money moves, no live Paystack keys.

import { supabase } from "@/lib/supabase";
import type {
  AdmissionDocument,
  AdmissionDocumentKind,
  AdmissionSettings,
} from "@/lib/types";

export const ADMISSION_DOC_BUCKET = "admission-documents";
export const MAX_ADMISSION_DOC_BYTES = 5 * 1024 * 1024; // 5 MB
export const ADMISSION_DOC_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export const ADMISSION_DOC_ACCEPT_ATTR =
  "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export const ADMISSION_DOC_KINDS: AdmissionDocumentKind[] = [
  "Birth certificate",
  "Previous result",
  "Passport photo",
  "Other",
];

export const ADMISSION_STATUSES = [
  "Submitted",
  "Under review",
  "Assessment",
  "Offered",
  "Rejected",
  "Waitlisted",
  "Enrolled",
] as const;

/** Human-readable reason a file cannot be uploaded, or null if OK. */
export function validateAdmissionDoc(file: File): string | null {
  if (
    !ADMISSION_DOC_MIME_TYPES.includes(
      file.type as (typeof ADMISSION_DOC_MIME_TYPES)[number],
    )
  ) {
    return "Choose a PDF, JPG or PNG file.";
  }
  if (file.size > MAX_ADMISSION_DOC_BYTES) {
    return "Each document must be 5 MB or smaller.";
  }
  return null;
}

/** Public admission settings for a school slug: branding, current
 *  term, classes and the admission fee setting. Works signed out. */
export async function fetchAdmissionSettings(
  slug: string,
): Promise<AdmissionSettings | null> {
  const { data, error } = await supabase.rpc("school_admission_settings", {
    p_slug: slug,
  });
  if (error || !data) return null;
  const row = data as { ok?: boolean } & AdmissionSettings;
  return row.ok ? row : null;
}

export type AdmissionSubmitInput = {
  schoolId: string;
  childFirstName: string;
  childLastName: string;
  classId: string | null;
  entryTermId: string | null;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  previousSchool: string;
  notes: string;
  source: string;
  feeStatus: string;
  feeAmount: number | null;
  feeReference: string | null;
  feeChannel: string | null;
};

/** Submit the application through the public RPC. Returns the
 *  application id, its ADM-YYYY-NNNN reference and (when the fee is
 *  on) the ADM-PAY test-payment reference on success. */
export async function submitAdmissionApplication(
  input: AdmissionSubmitInput,
): Promise<{
  ok: boolean;
  applicationId?: string;
  reference?: string;
  feeReference?: string | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("submit_admission_application", {
    p_school_id: input.schoolId,
    p_child_first_name: input.childFirstName.trim(),
    p_child_last_name: input.childLastName.trim(),
    p_class_id: input.classId,
    p_entry_term_id: input.entryTermId,
    p_parent_name: input.parentName.trim() || null,
    p_parent_phone: input.parentPhone.trim() || null,
    p_parent_email: input.parentEmail.trim() || null,
    p_previous_school: input.previousSchool.trim() || null,
    p_notes: input.notes.trim() || null,
    p_source: input.source.trim() || "Online form",
    p_fee_status: input.feeStatus,
    p_fee_amount: input.feeAmount,
    p_fee_reference: input.feeReference,
    p_fee_channel: input.feeChannel,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    application_id?: string;
    reference?: string;
    fee_reference?: string | null;
  };
  if (row.ok === false)
    return { ok: false, error: row.error ?? "Could not submit the application." };
  return {
    ok: true,
    applicationId: row.application_id,
    reference: row.reference,
    feeReference: row.fee_reference ?? null,
  };
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "document";
}

/** Upload one document for an application that already exists, then
 *  record its row. A fresh storage path is used on every attempt, so
 *  retrying a failed file never collides with an earlier attempt.
 *  Returns the document row on success, or an error to show with a
 *  retry button - the application itself is already saved, so a
 *  failed upload never loses it. */
export async function uploadAdmissionDocument(
  schoolId: string,
  applicationId: string,
  kind: AdmissionDocumentKind,
  file: File,
): Promise<{ ok: boolean; document?: AdmissionDocument; error?: string }> {
  const problem = validateAdmissionDoc(file);
  if (problem) return { ok: false, error: problem };
  const path = `${schoolId}/${applicationId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(ADMISSION_DOC_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError)
    return { ok: false, error: `Could not upload ${file.name}: ${uploadError.message}` };
  const { data, error: rowError } = await supabase
    .from("admission_documents")
    .insert({
      school_id: schoolId,
      application_id: applicationId,
      kind,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      status: "Pending",
    })
    .select("*")
    .single();
  if (rowError) {
    // File is in the bucket but its row is missing: remove the orphan
    // so a retry starts clean.
    await supabase.storage.from(ADMISSION_DOC_BUCKET).remove([path]);
    return { ok: false, error: `Could not save ${file.name}: ${rowError.message}` };
  }
  return { ok: true, document: data as AdmissionDocument };
}

/** Signed URL (1 hour) for one private document, for the admin
 *  review page. Only the platform owner / that school's school_admin
 *  may open it (bucket policies, migration 0007). */
export async function signedAdmissionDocUrl(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ADMISSION_DOC_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}
