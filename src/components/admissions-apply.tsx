"use client";

import { useEffect, useState } from "react";
import { ConfigBanner, Card, PageHeader, btnCls, inputCls, labelCls } from "@/components/ui";
import { SchoolLogo } from "@/components/school-logo";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  ADMISSION_DOC_ACCEPT_ATTR,
  ADMISSION_DOC_KINDS,
  fetchAdmissionSettings,
  submitAdmissionApplication,
  uploadAdmissionDocument,
  validateAdmissionDoc,
} from "@/lib/admissions";
import type {
  AdmissionDocumentKind,
  AdmissionSettings,
} from "@/lib/types";

type DocState = {
  file: File | null;
  state: "idle" | "uploading" | "done" | "error";
  error: string;
};

const emptyDocs = (): Record<AdmissionDocumentKind, DocState> => ({
  "Birth certificate": { file: null, state: "idle", error: "" },
  "Previous result": { file: null, state: "idle", error: "" },
  "Passport photo": { file: null, state: "idle", error: "" },
  Other: { file: null, state: "idle", error: "" },
});

/** Public admission apply form: /<slug>/admissions/apply (and the
 *  plain /admissions/apply, which asks for the school short name
 *  first). No sign-in needed. School logo + name + motto at the top;
 *  Light/Dark works through the shared theme. */
export default function AdmissionsApply({ slug }: { slug: string }) {
  const [settings, setSettings] = useState<AdmissionSettings | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found">("loading");

  const [childFirst, setChildFirst] = useState("");
  const [childLast, setChildLast] = useState("");
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [prevSchool, setPrevSchool] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("Online form");

  // Test checkout (migration 0007): confirming here records a test
  // payment with the application - no real money moves.
  const [feeChannel, setFeeChannel] = useState("Card");
  const [feeConfirmed, setFeeConfirmed] = useState(false);

  const [docs, setDocs] = useState(emptyDocs());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [submitted, setSubmitted] = useState<{
    applicationId: string;
    reference: string;
    feeReference: string | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const s = await fetchAdmissionSettings(slug);
      if (!s) {
        setState("not-found");
        return;
      }
      setSettings(s);
      if (s.current_term) setTermId(s.current_term.id);
      setState("ready");
    })();
  }, [slug]);

  if (state === "loading") {
    return <p className="text-sm text-slate-500">Loading the application form…</p>;
  }

  if (state === "not-found" || !settings) {
    return (
      <div>
        <PageHeader title="School not found" sub="There is no school at this address on Digital SchoolVerse." />
        <p className="text-sm text-slate-500">
          Check the link, or ask the platform owner for the school&apos;s correct address.
        </p>
      </div>
    );
  }

  const school = settings.school;
  const feeOn = settings.fee.required && settings.fee.amount > 0;
  const feeAmount = settings.fee.amount;

  const pickFile = (kind: AdmissionDocumentKind, file: File | null) => {
    if (!file) {
      setDocs((d) => ({ ...d, [kind]: { file: null, state: "idle", error: "" } }));
      return;
    }
    const problem = validateAdmissionDoc(file);
    setDocs((d) => ({
      ...d,
      [kind]: { file: problem ? null : file, state: "idle", error: problem ?? "" },
    }));
  };

  const uploadOne = async (
    kind: AdmissionDocumentKind,
    applicationId: string,
  ) => {
    const slot = docs[kind];
    if (!slot.file) return;
    setDocs((d) => ({ ...d, [kind]: { ...d[kind], state: "uploading", error: "" } }));
    const res = await uploadAdmissionDocument(
      school.id,
      applicationId,
      kind,
      slot.file,
    );
    setDocs((d) => ({
      ...d,
      [kind]: {
        ...d[kind],
        state: res.ok ? "done" : "error",
        error: res.ok ? "" : (res.error ?? "Upload failed."),
      },
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childFirst.trim() || !childLast.trim()) {
      setMsg("Enter the child's first and last name.");
      return;
    }
    if (feeOn && !feeConfirmed) {
      setMsg("This school charges an admission form fee - confirm the test payment below first.");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await submitAdmissionApplication({
      schoolId: school.id,
      childFirstName: childFirst,
      childLastName: childLast,
      classId: classId || null,
      entryTermId: termId || null,
      parentName,
      parentPhone,
      parentEmail,
      previousSchool: prevSchool,
      notes,
      source,
      feeStatus: feeOn ? "Paid" : "Free",
      feeAmount: feeOn ? feeAmount : null,
      feeReference: null, // issued server-side, see migration 0007
      feeChannel: feeOn ? feeChannel : null,
    });
    if (!res.ok || !res.applicationId || !res.reference) {
      setMsg(res.error ?? "Could not submit the application.");
      setBusy(false);
      return;
    }
    setSubmitted({
      applicationId: res.applicationId,
      reference: res.reference,
      feeReference: res.feeReference ?? null,
    });
    setBusy(false);
    // Uploads run after the application exists, one file at a time.
    // A failed upload never loses the application - the success screen
    // below shows the error with a retry button for that file.
    for (const kind of ADMISSION_DOC_KINDS) {
      if (docs[kind].file) await uploadOne(kind, res.applicationId);
    }
  };

  if (submitted) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title={`Apply to ${school.name}`} sub="Admission application" />
        <div className="mb-4 flex items-center gap-3">
          <SchoolLogo name={school.name} logoUrl={school.logo_url} size={56} />
          <div>
            <p className="font-bold text-ink">{school.name}</p>
            {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
          </div>
        </div>
        <Card>
          <h2 className="font-semibold text-green-700">Application submitted</h2>
          <p className="mt-2 text-sm">
            Your application reference is{" "}
            <strong className="font-mono">{submitted.reference}</strong>. Keep
            it safe - quote it in any message to the school.
          </p>
          {feeOn && (
            <p className="mt-1 text-sm">
              Test payment recorded -{" "}
              <strong className="font-mono">{submitted.feeReference ?? "-"}</strong>,{" "}
              ₦{Number(feeAmount).toLocaleString()} by {feeChannel}. No real
              money moved.
            </p>
          )}
          <p className="mt-1 text-sm text-slate-500">
            The school will review the application and contact{" "}
            {parentName || "you"} on {parentPhone || parentEmail || "the details you gave"}.
          </p>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Documents</h2>
          <ul className="space-y-2 text-sm">
            {ADMISSION_DOC_KINDS.map((kind) => {
              const slot = docs[kind];
              if (!slot.file && slot.state === "idle") return null;
              return (
                <li key={kind} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
                  <span>
                    <strong>{kind}</strong> - {slot.file?.name ?? ""}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${slot.state === "done" ? "bg-green-100 text-green-700" : slot.state === "error" ? "bg-red-100 text-red-700" : slot.state === "uploading" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"}`}>
                      {slot.state === "done" ? "Uploaded" : slot.state === "error" ? "Upload failed" : slot.state === "uploading" ? "Uploading…" : "Not uploaded"}
                    </span>
                  </span>
                  {slot.state === "error" && (
                    <span className="flex items-center gap-2">
                      <span className="text-red-700">{slot.error}</span>
                      <button
                        className="font-semibold text-royal"
                        onClick={() => uploadOne(kind, submitted.applicationId)}
                      >
                        Retry upload
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            If an upload failed, the application is still saved under{" "}
            {submitted.reference} - retry the file above, or send it to the
            school later quoting that reference.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader title={`Apply to ${school.name}`} sub="Admission application - online form" />
      <div className="mb-4 flex items-center gap-3">
        <SchoolLogo name={school.name} logoUrl={school.logo_url} size={56} />
        <div>
          <p className="font-bold text-ink">{school.name}</p>
          {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
        </div>
      </div>
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <h2 className="mb-3 font-semibold">Child applying</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Child&apos;s first name *</label><input className={inputCls} value={childFirst} onChange={(e) => setChildFirst(e.target.value)} /></div>
            <div><label className={labelCls}>Child&apos;s last name *</label><input className={inputCls} value={childLast} onChange={(e) => setChildLast(e.target.value)} /></div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Class applying for</label>
              <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">- Choose a class -</option>
                {settings.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Entry term</label>
              <select className={inputCls} value={termId} onChange={(e) => setTermId(e.target.value)}>
                <option value="">- Choose a term -</option>
                {settings.terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.session} - {t.name}{t.is_current ? " (current)" : ""}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className={labelCls}>Previous school</label>
            <input className={inputCls} value={prevSchool} onChange={(e) => setPrevSchool(e.target.value)} placeholder="School the child attended before, if any" />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Parent / guardian</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Full name</label><input className={inputCls} value={parentName} onChange={(e) => setParentName(e.target.value)} /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="e.g. 0803 000 0000" /></div>
          </div>
          <div className="mt-3">
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>How did you hear about us?</label>
              <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
                <option>Online form</option><option>Walk-in</option><option>Phone</option><option>Referral</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className={labelCls}>Notes for the school (optional)</label>
            <textarea className={inputCls} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the school should know" />
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Admission form fee</h2>
          {feeOn ? (
            <div>
              <p className="mb-3 text-sm text-slate-500">
                This school charges an admission form fee of{" "}
                <strong>₦{Number(feeAmount).toLocaleString()}</strong>. Pay it
                here with the test checkout before you submit -{" "}
                <strong>Test checkout - no real money moves.</strong> A test
                payment reference (ADM-PAY-…) is issued when you submit.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Channel</label>
                  <select className={inputCls} value={feeChannel} onChange={(e) => { setFeeChannel(e.target.value); setFeeConfirmed(false); }} disabled={feeConfirmed}>
                    <option>Card</option><option>Bank transfer</option>
                  </select>
                </div>
                <div className="flex items-end">
                  {feeConfirmed ? (
                    <p className="rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-700">
                      Test payment confirmed - ₦{Number(feeAmount).toLocaleString()} by {feeChannel}. No real money moved.
                    </p>
                  ) : (
                    <button type="button" className={btnCls} onClick={() => setFeeConfirmed(true)}>
                      Confirm test payment of ₦{Number(feeAmount).toLocaleString()} (test)
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Real card payments need live Paystack keys, which are not connected yet - this test checkout only records the payment in the school&apos;s records.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Applying to {school.name} is free - there is no admission form fee.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Documents</h2>
          <p className="mb-3 text-sm text-slate-500">
            PDF, JPG or PNG only, max 5 MB each. Files upload after you submit - if one fails, your application is still saved and you can retry that file.
          </p>
          <div className="space-y-3">
            {ADMISSION_DOC_KINDS.map((kind) => (
              <div key={kind}>
                <label className={labelCls}>
                  {kind}
                  {kind === "Other" ? " (optional)" : ""}
                </label>
                <input
                  className={inputCls}
                  type="file"
                  accept={ADMISSION_DOC_ACCEPT_ATTR}
                  onChange={(e) => pickFile(kind, e.target.files?.[0] ?? null)}
                />
                {docs[kind].file && (
                  <p className="mt-1 text-xs text-slate-500">
                    {docs[kind].file!.name} - {(docs[kind].file!.size / 1024).toFixed(0)} KB
                  </p>
                )}
                {docs[kind].error && (
                  <p className="mt-1 text-xs font-semibold text-red-700">{docs[kind].error}</p>
                )}
              </div>
            ))}
          </div>
        </Card>

        <button className={btnCls} disabled={busy || !isSupabaseConfigured}>
          {busy ? "Submitting…" : feeOn ? "Submit application (test payment confirmed)" : "Submit application"}
        </button>
        {!isSupabaseConfigured && (
          <p className="text-xs text-slate-400">Supabase is not connected yet, so nothing is saved.</p>
        )}
      </form>
    </div>
  );
}
