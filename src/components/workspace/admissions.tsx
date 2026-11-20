"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type {
  AdmissionApplication,
  AdmissionDocument,
  ClassRow,
  Term,
} from "@/lib/types";
import { ADMISSION_DOC_BUCKET, signedAdmissionDocUrl } from "@/lib/admissions";
import { yearNow } from "@/lib/roles";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";

const PIPELINE: { status: string; next: string[] }[] = [
  { status: "Submitted", next: ["Under review", "Rejected"] },
  { status: "Under review", next: ["Assessment", "Rejected", "Waitlisted"] },
  { status: "Assessment", next: ["Offered", "Rejected", "Waitlisted"] },
  { status: "Offered", next: ["Enrolled", "Rejected", "Waitlisted"] },
  { status: "Waitlisted", next: ["Offered", "Rejected"] },
  { status: "Rejected", next: [] },
  { status: "Enrolled", next: [] },
];

function statusBadge(status: string): string {
  switch (status) {
    case "Offered":
    case "Enrolled":
      return "bg-green-100 text-green-700";
    case "Rejected":
      return "bg-red-100 text-red-700";
    case "Waitlisted":
    case "Assessment":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-200 text-slate-600";
  }
}

function feeBadge(a: AdmissionApplication): { text: string; cls: string } {
  if (a.fee_status === "Paid")
    return {
      text: `Paid - ${a.fee_reference ?? ""} (${a.fee_channel ?? ""}, ₦${Number(a.fee_amount ?? 0).toLocaleString()})`,
      cls: "bg-green-100 text-green-700",
    };
  if (a.fee_status === "Unpaid")
    return {
      text: `Unpaid - ₦${Number(a.fee_amount ?? 0).toLocaleString()}${a.fee_reference ? ` (${a.fee_reference})` : ""}`,
      cls: "bg-red-100 text-red-700",
    };
  return { text: "Free - no fee", cls: "bg-slate-200 text-slate-600" };
}

export default function Admissions() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const base = useWorkspaceBase();
  const canManage = useCanManage();
  const readOnly = !!profile && !canManage;
  const [apps, setApps] = useState<AdmissionApplication[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [classFilter, setClassFilter] = useState("All");
  const [selectedId, setSelectedId] = useState("");
  const [docs, setDocs] = useState<AdmissionDocument[]>([]);
  const [assessDate, setAssessDate] = useState("");
  const [assessNote, setAssessNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [docNote, setDocNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [studentCount, setStudentCount] = useState(0);

  const load = async () => {
    if (!schoolId) return;
    const { data: a } = await supabase
      .from("admission_applications")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    setApps((a as AdmissionApplication[] | null) ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", schoolId).order("name");
    setClasses((c as ClassRow[] | null) ?? []);
    const { data: t } = await supabase.from("terms").select("*").eq("school_id", schoolId).order("created_at");
    setTerms((t as Term[] | null) ?? []);
    const { count } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId);
    setStudentCount(count ?? 0);
  };

  /* eslint-disable react-hooks/set-state-in-effect -- same data-loading pattern as the rest of this codebase */
  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const selected = apps.find((a) => a.id === selectedId) ?? null;

  const loadDocs = async (applicationId: string) => {
    const { data } = await supabase
      .from("admission_documents")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at");
    setDocs((data as AdmissionDocument[] | null) ?? []);
  };

  useEffect(() => {
    if (selectedId) loadDocs(selectedId);
    else setDocs([]);
    const app = apps.find((a) => a.id === selectedId);
    if (app) {
      setAssessDate(app.assessment_date ?? "");
      setAssessNote(app.assessment_note ?? "");
      setDecisionNote(app.decision_note ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const classNameOf = (id: string | null) =>
    classes.find((c) => c.id === id)?.name ?? "-";
  const termNameOf = (id: string | null) => {
    const t = terms.find((x) => x.id === id);
    return t ? `${t.session} - ${t.name}` : "-";
  };

  const counts: Record<string, number> = {};
  for (const a of apps) counts[a.status] = (counts[a.status] ?? 0) + 1;

  const filtered = apps.filter((a) => {
    if (statusFilter !== "All" && a.status !== statusFilter) return false;
    if (classFilter !== "All" && a.class_id !== classFilter) return false;
    if (search.trim()) {
      const hay = `${a.child_first_name} ${a.child_last_name} ${a.reference} ${a.parent_name ?? ""} ${a.parent_email ?? ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const setStatus = async (
    app: AdmissionApplication,
    status: string,
  ) => {
    setBusy(true);
    setMsg("");
    const patch: Record<string, unknown> = { status };
    if (status === "Assessment") {
      patch.assessment_date = assessDate || null;
      patch.assessment_note = assessNote.trim() || null;
    }
    if (status === "Offered" || status === "Rejected" || status === "Waitlisted") {
      patch.decision_note = decisionNote.trim() || null;
    }
    const { error } = await supabase
      .from("admission_applications")
      .update(patch)
      .eq("id", app.id);
    setMsg(
      error
        ? `Could not update: ${error.message}`
        : `${app.child_first_name} ${app.child_last_name} moved to ${status}.`,
    );
    setBusy(false);
    load();
  };

  const enrol = async (app: AdmissionApplication) => {
    if (!schoolId) return;
    if (app.status !== "Offered") {
      setMsg("Only an Offered application can be enrolled.");
      return;
    }
    setBusy(true);
    setMsg("");
    // Next admission number - same pattern as the Students register:
    // DSV/YYYY/NNNN from the pupil count.
    const admissionNo = `DSV/${yearNow()}/${String(studentCount + 1).padStart(4, "0")}`;
    const cls = classes.find((c) => c.id === app.class_id);
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        school_id: schoolId,
        branch_id: cls?.branch_id ?? null,
        class_id: app.class_id,
        admission_no: admissionNo,
        first_name: app.child_first_name,
        last_name: app.child_last_name,
      })
      .select("*")
      .single();
    if (studentError || !student) {
      setMsg(`Could not enrol: ${studentError?.message ?? "unknown error"}`);
      setBusy(false);
      return;
    }
    // Create or reuse the parent record, then link them.
    let parentId: string | null = null;
    const parentName = (app.parent_name ?? "").trim();
    const [pFirst, ...pRest] = parentName.split(/\s+/).filter(Boolean);
    if (parentName) {
      let existing = null;
      if (app.parent_email) {
        const { data } = await supabase
          .from("parents")
          .select("id")
          .eq("school_id", schoolId)
          .eq("email", app.parent_email.trim())
          .maybeSingle();
        existing = data;
      }
      if (!existing && app.parent_phone) {
        const { data } = await supabase
          .from("parents")
          .select("id")
          .eq("school_id", schoolId)
          .eq("phone", app.parent_phone.trim())
          .maybeSingle();
        existing = data;
      }
      if (existing) {
        parentId = (existing as { id: string }).id;
      } else {
        const { data: created, error: parentError } = await supabase
          .from("parents")
          .insert({
            school_id: schoolId,
            first_name: pFirst ?? parentName,
            last_name: pRest.join(" ") || parentName,
            phone: app.parent_phone,
            email: app.parent_email,
          })
          .select("id")
          .single();
        if (!parentError && created) parentId = (created as { id: string }).id;
      }
    }
    if (parentId) {
      await supabase.from("parent_children").upsert(
        {
          parent_id: parentId,
          student_id: (student as { id: string }).id,
          relationship: "Parent",
          status: "Approved",
        },
        { onConflict: "parent_id,student_id" },
      );
    }
    const { error } = await supabase
      .from("admission_applications")
      .update({ status: "Enrolled", student_id: (student as { id: string }).id })
      .eq("id", app.id);
    setMsg(
      error
        ? `Pupil created (${admissionNo}) but the application could not be marked Enrolled: ${error.message}`
        : `${app.child_first_name} ${app.child_last_name} enrolled - ${admissionNo}${parentId ? ", parent linked." : "."}`,
    );
    setBusy(false);
    load();
  };

  const reviewDoc = async (doc: AdmissionDocument, status: string) => {
    const { error } = await supabase
      .from("admission_documents")
      .update({ status, review_note: docNote.trim() || null })
      .eq("id", doc.id);
    setMsg(
      error
        ? `Could not update document: ${error.message}`
        : `${doc.file_name} marked ${status}.`,
    );
    setDocNote("");
    if (!error && selectedId) loadDocs(selectedId);
  };

  const deleteDoc = async (doc: AdmissionDocument) => {
    const { error } = await supabase
      .from("admission_documents")
      .delete()
      .eq("id", doc.id);
    if (!error) {
      await supabase.storage.from(ADMISSION_DOC_BUCKET).remove([doc.storage_path]);
      setMsg(`${doc.file_name} removed.`);
      if (selectedId) loadDocs(selectedId);
    } else {
      setMsg(`Could not remove document: ${error.message}`);
    }
  };

  const openDoc = async (doc: AdmissionDocument) => {
    const url = await signedAdmissionDocUrl(doc.storage_path);
    if (url) window.open(url, "_blank", "noopener");
    else setMsg(`Could not open ${doc.file_name} - the signed link failed.`);
  };

  const pipeline = PIPELINE.find((p) => p.status === selected?.status);

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Admissions" sub="Online applications - review, assess, offer and enrol." />
      {readOnly && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile?.role.replace("_", " ")} - read-only view.
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {["All", ...PIPELINE.map((p) => p.status)].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${statusFilter === s ? "bg-royal text-white" : "border border-line bg-white text-slate-600"}`}
          >
            {s} ({s === "All" ? apps.length : (counts[s] ?? 0)})
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="md:col-span-2">
          <Card>
            <div className="mb-3 flex gap-2">
              <input
                className={inputCls}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, reference or parent…"
              />
              <select className={inputCls} value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filter by class">
                <option value="All">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <ul className="space-y-2 text-sm">
              {filtered.map((a) => {
                const fee = feeBadge(a);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelectedId(a.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left ${selectedId === a.id ? "bg-royal/10 ring-1 ring-royal" : "bg-mist"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <strong>{a.child_first_name} {a.child_last_name}</strong>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(a.status)}`}>{a.status}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {a.reference} · {classNameOf(a.class_id)} · {new Date(a.created_at).toLocaleDateString()}
                      </span>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${fee.cls}`}>{fee.text}</span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="text-slate-400">
                  No applications yet - share the apply link:{" "}
                  <span className="font-semibold text-ink">{base || "/your-school"}/admissions/apply</span>
                </li>
              )}
            </ul>
          </Card>
        </div>

        <div className="md:col-span-3">
          {!selected ? (
            <Card>
              <p className="text-sm text-slate-500">
                Pick an application on the left to review it - fee payment, documents, assessment and enrolment.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">
                      {selected.child_first_name} {selected.child_last_name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {selected.reference} · {classNameOf(selected.class_id)} · Entry {termNameOf(selected.entry_term_id)}
                    </p>
                    <p className="text-sm text-slate-500">
                      Parent: {selected.parent_name ?? "-"} · {selected.parent_phone ?? ""} {selected.parent_email ? `· ${selected.parent_email}` : ""}
                    </p>
                    {selected.previous_school && (
                      <p className="text-sm text-slate-500">Previous school: {selected.previous_school}</p>
                    )}
                    {selected.notes && (
                      <p className="mt-1 text-sm text-slate-600">Notes: {selected.notes}</p>
                    )}
                    <p className="mt-1 text-sm text-slate-500">Source: {selected.source}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(selected.status)}`}>
                    {selected.status}
                  </span>
                </div>
                <p className="mt-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feeBadge(selected).cls}`}>
                    {feeBadge(selected).text}
                  </span>
                  {selected.student_id && (
                    <Link href={`${base}/students/${selected.student_id}/report-card`} className="ml-3 font-semibold text-royal">
                      Enrolled pupil - report card →
                    </Link>
                  )}
                </p>
              </Card>

              <Card>
                <h2 className="mb-3 font-semibold">Review</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Assessment date</label>
                    <input className={inputCls} type="date" value={assessDate} onChange={(e) => setAssessDate(e.target.value)} disabled={readOnly} />
                  </div>
                  <div>
                    <label className={labelCls}>Assessment note</label>
                    <input className={inputCls} value={assessNote} onChange={(e) => setAssessNote(e.target.value)} placeholder="e.g. Assessment Tue 10am, Room 4" disabled={readOnly} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className={labelCls}>Decision note</label>
                  <input className={inputCls} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Note shown with the offer / rejection" disabled={readOnly} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(pipeline?.next ?? []).map((next) => (
                    <button
                      key={next}
                      className={btnCls}
                      disabled={busy || readOnly}
                      onClick={() => setStatus(selected, next)}
                    >
                      Move to {next}
                    </button>
                  ))}
                  {selected.status === "Offered" && (
                    <button
                      className={btnCls}
                      disabled={busy || readOnly}
                      onClick={() => enrol(selected)}
                    >
                      Enrol pupil (next: DSV/{yearNow()}/{String(studentCount + 1).padStart(4, "0")})
                    </button>
                  )}
                  {(pipeline?.next.length ?? 0) === 0 && selected.status !== "Offered" && (
                    <p className="text-sm text-slate-500">This application is {selected.status.toLowerCase()} - no further moves.</p>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Pipeline: Submitted - Under review - Assessment - Offered / Rejected / Waitlisted - Enrolled. Enrolling creates the pupil with an auto admission number, reuses or creates the parent record, and links them.
                </p>
              </Card>

              <Card>
                <h2 className="mb-3 font-semibold">Documents ({docs.length})</h2>
                {docs.length === 0 ? (
                  <p className="text-sm text-slate-500">No documents uploaded for this application yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {docs.map((d) => (
                      <li key={d.id} className="rounded-lg bg-mist px-3 py-2">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <strong>{d.kind}</strong> - {d.file_name}
                            <span className="ml-2 text-xs text-slate-500">
                              {d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB` : ""} · {new Date(d.created_at).toLocaleDateString()}
                            </span>
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status === "Verified" ? "bg-green-100 text-green-700" : d.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                            {d.status}
                          </span>
                        </span>
                        {d.review_note && (
                          <p className="mt-1 text-xs text-slate-500">Review note: {d.review_note}</p>
                        )}
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <button className="font-semibold text-royal" onClick={() => openDoc(d)}>
                            View / download
                          </button>
                          {!readOnly && d.status !== "Verified" && (
                            <button className="font-semibold text-green-700" onClick={() => reviewDoc(d, "Verified")}>
                              Verify
                            </button>
                          )}
                          {!readOnly && d.status !== "Rejected" && (
                            <button className="font-semibold text-red-700" onClick={() => reviewDoc(d, "Rejected")}>
                              Reject
                            </button>
                          )}
                          {!readOnly && (
                            <button className="font-semibold text-slate-500" onClick={() => deleteDoc(d)}>
                              Remove
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {!readOnly && docs.length > 0 && (
                  <div className="mt-3">
                    <label className={labelCls}>Review note (saved with Verify / Reject above)</label>
                    <input className={inputCls} value={docNote} onChange={(e) => setDocNote(e.target.value)} placeholder="e.g. Birth certificate is clear and matches the name" />
                  </div>
                )}
                <p className="mt-3 text-xs text-slate-400">
                  Documents are stored privately - opening one creates a signed link that lasts 1 hour.
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
