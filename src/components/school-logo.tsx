"use client";

import { useRef, useState } from "react";
import { schoolInitials, uploadSchoolLogo, removeSchoolLogo, LOGO_ACCEPT_ATTR } from "@/lib/logo";

/** A school's logo, falling back to its initials in a royal-blue disc
 *  when no logo has been uploaded yet. Renders on light and dark themes
 *  (the image sits on a white disc so dark logos stay readable in Dark). */
export function SchoolLogo({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-white object-cover ring-1 ring-black/10"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-royal font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-label={`${name} - no logo set`}
    >
      {schoolInitials(name)}
    </span>
  );
}

/** Logo picker: preview + upload / remove, for School Setup and the
 *  Mother Board school control page. Calls `onChanged` with the new
 *  public URL (or null after removal) so the page can refresh. */
export function LogoUploadField({
  schoolId,
  schoolName,
  currentUrl,
  onChanged,
  disabled,
}: {
  schoolId: string;
  schoolName: string;
  currentUrl: string | null | undefined;
  onChanged: (url: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    const res = await uploadSchoolLogo(schoolId, file);
    if (res.url) {
      setPreview(res.url);
      setMsg(
        res.colorNote ??
          "Logo saved - it now shows on the portal and report cards.",
      );
      onChanged(res.url);
    } else {
      setMsg(res.error ?? "Could not upload logo.");
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm(`Remove the logo for ${schoolName}?`)) return;
    setBusy(true);
    setMsg("");
    const res = await removeSchoolLogo(schoolId);
    if (res.error) {
      setMsg(res.error);
    } else {
      setPreview(null);
      setMsg("Logo removed.");
      onChanged(null);
    }
    setBusy(false);
  };

  return (
    <div className="flex items-start gap-3">
      <SchoolLogo name={schoolName} logoUrl={preview} size={64} />
      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT_ATTR}
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-royal px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {preview ? "Change logo" : "Upload logo"}
          </button>
          {preview && (
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
              disabled={disabled || busy}
              onClick={() => void remove()}
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          PNG, JPG or WebP, up to 2 MB. This logo appears on the school
          portal header for every user of the school, on the sign-in page,
          and at the top of student report cards. Its main colour becomes
          the portal colour, and the tab icon and home-screen icon become
          this logo. A colour you pick below is never overwritten by a
          logo upload.
        </p>
        {msg && <p className="mt-1 text-xs font-medium text-royal">{msg}</p>}
      </div>
    </div>
  );
}
