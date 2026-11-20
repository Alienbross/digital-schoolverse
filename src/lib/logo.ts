import { supabase } from "@/lib/supabase";
import {
  extractPrimaryColorFromFile,
  notifyBrandingChanged,
} from "@/lib/branding";

/** School logos live in Supabase Storage, one file per school:
 *  `school-logos/<school_id>/logo.<ext>`. The public URL is saved in
 *  `schools.logo_url` (column from migration 0001) and shown in the
 *  portal header, on the login / invite pages and on report cards.
 *  Storage policies (migration 0003) let anyone read a logo, but only
 *  the platform owner or that school's own school_admin may upload,
 *  replace or delete it.
 */

export const LOGO_BUCKET = "school-logos";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_ACCEPT_ATTR = "image/png,image/jpeg,image/webp";

export type SchoolBranding = {
  name: string;
  motto: string | null;
  logo_url: string | null;
  // Portal primary colour (migration 0010). Null = default Royal Blue.
  primary_color?: string | null;
  logo_color?: string | null;
};

/** Human-readable reason a file cannot be used as a logo, or null if OK. */
export function validateLogoFile(file: File): string | null {
  if (!LOGO_MIME_TYPES.includes(file.type as (typeof LOGO_MIME_TYPES)[number])) {
    return "Choose a PNG, JPG or WebP image.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "Logo must be 2 MB or smaller.";
  }
  return null;
}

/** Upload (or replace) a school's logo. Returns the public URL on success.
 *  The logo's dominant colour is read from the file first (client-side
 *  canvas sampling): it is saved as logo_color, and - unless the admin
 *  has set a manual colour - also becomes the portal primary colour.
 *  When no colour can be read, the portal keeps Royal Blue and the
 *  returned note says so. */
export async function uploadSchoolLogo(
  schoolId: string,
  file: File,
): Promise<{ url?: string; error?: string; color?: string | null; colorNote?: string }> {
  const problem = validateLogoFile(file);
  if (problem) return { error: problem };

  // Read the colour from the file before uploading. A failure here is
  // not fatal - the logo still uploads, it just keeps Royal Blue.
  const extracted = await extractPrimaryColorFromFile(file);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${schoolId}/logo.${ext}`;

  // Remove a previous logo saved with a different extension, so the
  // bucket keeps exactly one logo per school.
  const { data: existing } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(schoolId);
  const stale = (existing ?? [])
    .filter((f) => f.name.startsWith("logo.") && f.name !== `logo.${ext}`)
    .map((f) => `${schoolId}/${f.name}`);
  if (stale.length > 0) {
    await supabase.storage.from(LOGO_BUCKET).remove(stale);
  }

  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: `Could not upload logo: ${uploadError.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);

  // A manual portal colour is never overwritten by a logo upload.
  const { data: current } = await supabase
    .from("schools")
    .select("primary_color_source")
    .eq("id", schoolId)
    .maybeSingle();
  const manual = (current as { primary_color_source?: string | null } | null)
    ?.primary_color_source === "manual";

  const colourUpdate =
    extracted && !manual
      ? { logo_color: extracted, primary_color: extracted, primary_color_source: "logo" }
      : extracted
        ? { logo_color: extracted }
        : !manual
          ? { logo_color: null, primary_color: null, primary_color_source: null }
          : { logo_color: null };
  const { error: saveError } = await supabase
    .from("schools")
    .update({ logo_url: publicUrl, ...colourUpdate })
    .eq("id", schoolId);
  if (saveError) {
    // Migration 0010 not run yet (the colour columns do not exist):
    // the logo itself must still save, just without its colour.
    const { error: retryError } = await supabase
      .from("schools")
      .update({ logo_url: publicUrl })
      .eq("id", schoolId);
    if (retryError) {
      return { error: `Logo uploaded but could not be saved: ${saveError.message}` };
    }
    notifyBrandingChanged();
    return {
      url: publicUrl,
      color: null,
      colorNote:
        "Logo saved, but its colour could not be saved yet - the portal keeps Royal Blue.",
    };
  }

  notifyBrandingChanged();
  return {
    url: publicUrl,
    color: extracted,
    colorNote: extracted
      ? manual
        ? "Logo saved - the portal keeps your chosen colour."
        : `Logo saved - the portal now uses ${extracted} from your logo.`
      : "Logo saved - no clear colour could be read from it, so the portal keeps Royal Blue.",
  };
}

/** Delete a school's logo file and clear `schools.logo_url`. A logo
 *  colour is cleared too, and a logo-derived portal colour falls back
 *  to Royal Blue; a manual colour is kept. */
export async function removeSchoolLogo(
  schoolId: string,
): Promise<{ error?: string }> {
  const { data: existing } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(schoolId);
  const paths = (existing ?? [])
    .filter((f) => f.name.startsWith("logo."))
    .map((f) => `${schoolId}/${f.name}`);
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(LOGO_BUCKET).remove(paths);
    if (error) return { error: `Could not delete logo file: ${error.message}` };
  }
  const { data: current } = await supabase
    .from("schools")
    .select("primary_color_source")
    .eq("id", schoolId)
    .maybeSingle();
  const manual = (current as { primary_color_source?: string | null } | null)
    ?.primary_color_source === "manual";
  const { error } = await supabase
    .from("schools")
    .update(
      manual
        ? { logo_url: null, logo_color: null }
        : { logo_url: null, logo_color: null, primary_color: null, primary_color_source: null },
    )
    .eq("id", schoolId);
  if (error) {
    // Migration 0010 not run yet: still clear the logo itself.
    const { error: retryError } = await supabase
      .from("schools")
      .update({ logo_url: null })
      .eq("id", schoolId);
    if (retryError) return { error: `Could not clear logo: ${error.message}` };
  }
  notifyBrandingChanged();
  return {};
}

/** Public branding (name / motto / logo) for a school, usable before
 *  sign-in on the login and invite-accept pages. Backed by the
 *  `school_branding()` function from migration 0003. */
export async function fetchSchoolBranding(
  schoolId: string,
): Promise<SchoolBranding | null> {
  const { data, error } = await supabase.rpc("school_branding", {
    p_school_id: schoolId,
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? (row as SchoolBranding) : null;
}

/** Initials shown when a school has no logo yet, e.g. "GA". */
export function schoolInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
