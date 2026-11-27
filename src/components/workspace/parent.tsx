"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type { ClassRow, Parent, Student, Subject, Term } from "@/lib/types";
import { gradeFor } from "@/components/report-card";
import {
  attendancePct,
  fetchCurrentTerm,
  nextPaymentRef,
  plainGrade,
} from "@/lib/roles";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import { LockedNotice } from "@/components/pending-banner";
import {
  addPupilLink,
  findPupilByAdmission,
  findPupilsByName,
} from "@/lib/registration";
import type { ParentChild, PupilMatch } from "@/lib/types";
import TimetableView from "@/components/workspace/timetable-view";
import AbsenceNoticesLog from "@/components/workspace/absence-notices";
import MessagesPanel from "@/components/workspace/messages-panel";
import ComplaintWizard from "@/components/workspace/complaint-wizard";
import { GameAccessControl } from "@/components/workspace/games";
import { ensureEveningReminders } from "@/lib/homework-reminders";
import { todayStr } from "@/lib/roles";
import { fetchChildBios, type StudentBioFields } from "@/lib/student-bio";
import { BioFieldsList } from "@/components/workspace/student-bio";
import {
  AI_LIVE_DRAFT_PREFIX,
  AI_LIVE_NOTE,
  fetchAiLive,
  requestAiDraft,
} from "@/lib/ai";

type Tab = "children" | "fees" | "messages" | "complaints" | "helper" | "summaries";

const TABS: { id: Tab; label: string }[] = [
  { id: "children", label: "My Children" },
  { id: "fees", label: "Fees & Receipts" },
  { id: "messages", label: "Messages" },
  { id: "complaints", label: "Complaints & Queries" },
  { id: "helper", label: "AI Parent Helper" },
  { id: "summaries", label: "Weekly Summaries" },
];

type ChildData = {
  student: Student;
  className: string;
  /** The pupil's own bio, as they filled it in - shown to the
   *  parent here, not gated behind the profile-share step. */
  bio: StudentBioFields | null;
  classTeacherName: string | null;
  scores: { subject: string; total: number; grade: string }[];
  average: number | null;
  attPct: number | null;
  attText: string;
  homework: { id: string; title: string; due_date: string | null; subject_id: string | null }[];
  bills: number;
  paid: number;
  onlinePaid: number;
};

export default function ParentWorkspace() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const base = useWorkspaceBase();
  const [tab, setTab] = useState<Tab>("children");
  const [parents, setParents] = useState<Parent[]>([]);
  const [pickerParentId, setPickerParentId] = useState("");
  const [children, setChildren] = useState<ChildData[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [term, setTerm] = useState<Term | null>(null);
  const [summaries, setSummaries] = useState<{ id: string; student_id: string; week_start: string; summary_text: string; school_note: string | null; status: string }[]>([]);
  const [selectedChild, setSelectedChild] = useState("");

  const isPreview = profile?.role === "platform_owner" || profile?.role === "school_admin";
  const parentId = profile?.parent_id ?? pickerParentId;
  const me = parents.find((p) => p.id === parentId);
  // Pending accounts (migration 0006) may do setup only: add pupils
  // and fill in their details. Fees, messages, complaints, helper
  // and summaries stay locked until approval.
  const isPending = !isPreview && profile?.status === "Pending";
  const [myLinks, setMyLinks] = useState<(ParentChild & { student: Student | null })[]>([]);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [setupMsg, setSetupMsg] = useState("");
  const [admNo, setAdmNo] = useState("");
  const [pupilFirst, setPupilFirst] = useState("");
  const [pupilLast, setPupilLast] = useState("");
  const [pupilClass, setPupilClass] = useState("");
  const [pupilRel, setPupilRel] = useState("Parent");
  const [foundPupil, setFoundPupil] = useState<PupilMatch | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    const { data: p } = await supabase.from("parents").select("*").eq("school_id", schoolId).order("last_name");
    setParents((p as Parent[] | null) ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", schoolId);
    setClasses((c as ClassRow[] | null) ?? []);
    const { data: sub } = await supabase.from("subjects").select("id, name").eq("school_id", schoolId);
    const sm: Record<string, string> = {};
    for (const r of (sub as { id: string; name: string }[] | null) ?? []) sm[r.id] = r.name;
    setSubjects(sm);
    const { data: t } = await supabase.from("teachers").select("id, first_name, last_name").eq("school_id", schoolId);
    const tm: Record<string, string> = {};
    for (const r of (t as { id: string; first_name: string; last_name: string }[] | null) ?? []) tm[r.id] = `${r.first_name} ${r.last_name}`;
    setTeachers(tm);
    setTerm(await fetchCurrentTerm(schoolId));
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  // Evening homework reminder (migration 0026): no background
  // scheduler in this build, so the check runs when the parent opens
  // their workspace. School days only, 4+ tasks, once per pupil per
  // day - see ensureEveningReminders.
  useEffect(() => {
    if (!schoolId || authLoading) return;
    ensureEveningReminders(schoolId, todayStr()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  // Load this parent's children and each child's records.
  useEffect(() => {
    if (!parentId || !schoolId) return;
    (async () => {
      const currentTerm = await fetchCurrentTerm(schoolId);
      setTerm(currentTerm);
      const { data: links } = await supabase
        .from("parent_children")
        .select("student_id")
        .eq("parent_id", parentId);
      const ids = ((links as { student_id: string }[] | null) ?? []).map((l) => l.student_id);
      if (ids.length === 0) {
        setChildren([]);
        return;
      }
      const { data: st } = await supabase.from("students").select("*").in("id", ids).order("first_name");
      const pupils = (st as Student[] | null) ?? [];
      // The pupils' bios, as they filled them in themselves
      // (migration 0023) - shown to the parent on each child card.
      const bios = await fetchChildBios(parentId);
      const bioByStudent = new Map(bios.map((b) => [b.studentId, b]));
      const built: ChildData[] = await Promise.all(pupils.map(async (pupil) => {
        const className = classes.find((c) => c.id === pupil.class_id)?.name ?? "-";
        const childBio = bioByStudent.get(pupil.id);
        let scores: ChildData["scores"] = [];
        let average: number | null = null;
        let attPct: number | null = null;
        let attText = "No register days yet";
        if (currentTerm) {
          const { data: sc } = await supabase
            .from("score_records")
            .select("*, subjects(name)")
            .eq("student_id", pupil.id)
            .eq("term_id", currentTerm.id);
          scores = ((sc as { test_score: number | null; assignment_score: number | null; exam_score: number | null; subjects: { name: string } | null }[] | null) ?? []).map((r) => {
            const total = (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
            return { subject: r.subjects?.name ?? "-", total, grade: gradeFor(total) };
          });
          if (scores.length > 0) average = scores.reduce((s, r) => s + r.total, 0) / scores.length;
          const { data: a } = await supabase
            .from("attendance_records")
            .select("status")
            .eq("student_id", pupil.id)
            .eq("term_id", currentTerm.id);
          const stats = attendancePct((a as { status: string }[] | null) ?? []);
          attPct = stats.pct;
          if (stats.total > 0) attText = `${stats.present} of ${stats.total} days`;
        }
        const { data: hw } = pupil.class_id
          ? await supabase.from("homework_assignments").select("id, title, due_date, subject_id").eq("class_id", pupil.class_id).eq("status", "Active").order("due_date")
          : { data: null };
        const { data: bills } = await supabase.from("fee_bills").select("amount").eq("student_id", pupil.id);
        const { data: pays } = await supabase.from("fee_payments").select("amount").eq("student_id", pupil.id);
        const { data: online } = await supabase.from("fee_online_payments").select("amount").eq("student_id", pupil.id).eq("status", "Paid");
        const sum = (rows: { amount: number | string }[] | null) =>
          (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
        return {
          student: pupil,
          className,
          bio: childBio?.bio ?? null,
          classTeacherName: childBio?.classTeacherName ?? null,
          scores,
          average,
          attPct,
          attText,
          homework: (hw as ChildData["homework"] | null) ?? [],
          bills: sum(bills as { amount: number }[] | null),
          paid: sum(pays as { amount: number }[] | null),
          onlinePaid: sum(online as { amount: number }[] | null),
        };
      }));
      setChildren(built);
      if (!selectedChild && built.length > 0) setSelectedChild(built[0].student.id);
      const { data: sums } = await supabase
        .from("weekly_summaries")
        .select("*")
        .in("student_id", ids)
        .eq("status", "Shared")
        .order("week_start", { ascending: false });
      setSummaries((sums as typeof summaries | null) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, schoolId, classes.length]);

  // My proposed pupil links, with their approval state - shown while
  // pending so a wrong child / wrong class can be spotted early.
  const loadLinks = async () => {
    if (!parentId || !schoolId) return;
    const { data: l } = await supabase
      .from("parent_children")
      .select("*, students(*)")
      .eq("parent_id", parentId);
    setMyLinks(
      ((l as (ParentChild & { students: Student | null })[] | null) ?? []).map(
        (r) => ({ ...r, student: r.students ?? null }),
      ),
    );
  };

  /* eslint-disable react-hooks/set-state-in-effect -- same data-loading pattern as the rest of this codebase */
  useEffect(() => {
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, schoolId]);

  useEffect(() => {
    if (me) {
      setEditFirst(me.first_name);
      setEditLast(me.last_name);
      setEditPhone(me.phone ?? "");
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMyDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || !editFirst.trim() || !editLast.trim()) return;
    const { error } = await supabase
      .from("parents")
      .update({
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        phone: editPhone.trim() || null,
      })
      .eq("id", me.id);
    setSetupMsg(error ? `Could not save: ${error.message}` : "Your details are saved.");
    if (!error) load();
  };

  const lookupPupil = async () => {
    if (!schoolId) return;
    setLinkBusy(true);
    setSetupMsg("");
    setFoundPupil(null);
    if (admNo.trim()) {
      const { pupil, error } = await findPupilByAdmission(schoolId, admNo);
      setLinkBusy(false);
      if (error) setSetupMsg(`Could not look up that pupil: ${error}`);
      else if (!pupil)
        setSetupMsg(`No pupil with admission number “${admNo.trim()}” in this school. Check the number - it looks like DSV/2026/0001.`);
      else setFoundPupil(pupil);
      return;
    }
    if (!pupilFirst.trim() || !pupilLast.trim()) {
      setLinkBusy(false);
      setSetupMsg("Enter an admission number, or the pupil's first and last name.");
      return;
    }
    const { pupils, error } = await findPupilsByName(
      schoolId,
      pupilFirst,
      pupilLast,
      pupilClass || null,
    );
    setLinkBusy(false);
    if (error) setSetupMsg(`Could not look up that pupil: ${error}`);
    else if (pupils.length === 0)
      setSetupMsg(`No pupil called “${pupilFirst.trim()} ${pupilLast.trim()}”${pupilClass ? " in that class" : ""}. Check the spelling, or use the admission number.`);
    else if (pupils.length > 1)
      setSetupMsg(`More than one pupil is called “${pupilFirst.trim()} ${pupilLast.trim()}”. Use the admission number to pick the right one.`);
    else setFoundPupil(pupils[0]);
  };

  const confirmAddPupil = async () => {
    if (!foundPupil || !parentId) return;
    setLinkBusy(true);
    const res = await addPupilLink(parentId, foundPupil.id, pupilRel);
    setLinkBusy(false);
    if (!res.ok) {
      setSetupMsg(res.error ?? "Could not add that pupil.");
      return;
    }
    setSetupMsg(
      `${foundPupil.first_name} ${foundPupil.last_name} added as a proposed link - the school admin and class teacher will check it before approval.`,
    );
    setFoundPupil(null);
    setAdmNo("");
    setPupilFirst("");
    setPupilLast("");
    load();
    loadLinks();
  };

  const withdrawLink = async (linkId: string) => {
    const { error } = await supabase
      .from("parent_children")
      .delete()
      .eq("id", linkId);
    setSetupMsg(error ? `Could not remove: ${error.message}` : "Proposed link removed.");
    if (!error) loadLinks();
  };

  const childLabels: Record<string, string> = {};
  for (const c of children) childLabels[c.student.id] = `${c.student.first_name} ${c.student.last_name} · ${c.className}`;
  const childIds = children.map((c) => c.student.id);
  const selected = children.find((c) => c.student.id === selectedChild) ?? children[0];

  if (!parentId && !authLoading) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Parent workspace" sub="Your children, their progress, fees and messages." />
        {isPreview ? (
          <Card>
            <p className="text-sm">You are signed in as {profile?.role.replace("_", " ")}. Pick a parent to preview their workspace:</p>
            <select className={`${inputCls} mt-3 max-w-sm`} value={pickerParentId} onChange={(e) => setPickerParentId(e.target.value)}>
              <option value="">- Choose a parent -</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
              ))}
            </select>
            {parents.length === 0 && <p className="mt-2 text-sm text-slate-500">No parents in this school yet - add them under Parents first.</p>}
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-slate-500">
              Your login is not linked to a parent record yet. Ask your school admin to link your account to your parent record (via an invite), then sign in again.
            </p>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title={`Parent workspace${me ? ` - ${me.first_name} ${me.last_name}` : ""}`}
        sub={term ? `${term.session} - ${term.name}` : "Your children, their progress, fees and messages."}
      />
      {isPreview && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <label className="font-semibold text-slate-600">Viewing as parent:</label>
          <select className={`${inputCls} max-w-xs`} value={pickerParentId} onChange={(e) => setPickerParentId(e.target.value)}>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const locked = !!isPending && t.id !== "children";
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              disabled={locked}
              title={locked ? "Locked until your account is approved" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${tab === t.id ? "bg-royal text-white" : "border border-line bg-white text-slate-600"}`}
            >
              {t.label}
              {locked ? " 🔒" : ""}
            </button>
          );
        })}
      </div>

      {tab === "children" && isPending ? (
        <div className="space-y-4">
          {setupMsg && <p className="text-sm font-medium text-royal">{setupMsg}</p>}
          <Card>
            <h2 className="mb-3 font-semibold">Your details</h2>
            <form onSubmit={saveMyDetails} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>First name</label><input className={inputCls} value={editFirst} onChange={(e) => setEditFirst(e.target.value)} /></div>
                <div><label className={labelCls}>Last name</label><input className={inputCls} value={editLast} onChange={(e) => setEditLast(e.target.value)} /></div>
              </div>
              <div><label className={labelCls}>Phone</label><input className={inputCls} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
              <button className={btnCls}>Save my details</button>
            </form>
          </Card>
          <Card>
            <h2 className="mb-1 font-semibold">Add a pupil</h2>
            <p className="mb-3 text-sm text-slate-500">
              Add each child under you - by admission number (best), or by
              name and class. The school admin and the class teacher check
              every link before approval.
            </p>
            <div className="space-y-2">
              <div>
                <label className={labelCls}>Admission number</label>
                <input className={inputCls} value={admNo} onChange={(e) => setAdmNo(e.target.value)} placeholder="e.g. DSV/2026/0001" />
              </div>
              <p className="text-xs text-slate-400">Or, without the number:</p>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} value={pupilFirst} onChange={(e) => setPupilFirst(e.target.value)} placeholder="Pupil's first name" />
                <input className={inputCls} value={pupilLast} onChange={(e) => setPupilLast(e.target.value)} placeholder="Pupil's last name" />
              </div>
              <select className={inputCls} value={pupilClass} onChange={(e) => setPupilClass(e.target.value)}>
                <option value="">- Class (optional) -</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <select className={inputCls} value={pupilRel} onChange={(e) => setPupilRel(e.target.value)}>
                  <option>Parent</option>
                  <option>Father</option>
                  <option>Mother</option>
                  <option>Guardian</option>
                </select>
                <button className={btnCls} onClick={lookupPupil} disabled={linkBusy}>
                  Look up pupil
                </button>
              </div>
              {foundPupil && (
                <div className="rounded-lg bg-mist px-3 py-2 text-sm">
                  <p>
                    <strong>{foundPupil.first_name} {foundPupil.last_name}</strong>
                    {foundPupil.class_name ? ` · ${foundPupil.class_name}` : ""}
                  </p>
                  <button className={`${btnCls} mt-2`} onClick={confirmAddPupil} disabled={linkBusy}>
                    Add as my child
                  </button>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">My pupils</h2>
            {myLinks.length === 0 ? (
              <p className="text-sm text-slate-500">No pupils linked yet - add one above.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {myLinks.map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                    <span>
                      <strong>{l.student ? `${l.student.first_name} ${l.student.last_name}` : "Unknown pupil"}</strong>
                      {l.student?.admission_no ? ` · ${l.student.admission_no}` : ""}
                      {l.relationship ? ` · ${l.relationship}` : ""}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${l.status === "Approved" ? "bg-green-100 text-green-700" : l.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                        {l.status ?? "Pending"}
                      </span>
                    </span>
                    {l.status === "Pending" && (
                      <button className="font-semibold text-royal" onClick={() => withdrawLink(l.id)}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : tab === "children" && (
        <div className="space-y-4">
          {me && (
            <AbsenceNoticesLog
              schoolId={schoolId ?? ""}
              parentId={me.id}
              mode="parent"
              title="Absence notices"
            />
          )}
          {children.length === 0 && (
            <Card><p className="text-sm text-slate-500">No children linked to this account yet. Ask the school admin to link your children under Parents.</p></Card>
          )}
          {children.map((c) => (
            <Card key={c.student.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{c.student.first_name} {c.student.last_name}</h2>
                  <p className="text-sm text-slate-500">{c.className} · {c.student.admission_no}</p>
                </div>
                <Link href={`${base}/students/${c.student.id}/profile`} className="font-semibold text-royal text-sm">
                  Profile →
                </Link>
                <Link href={`${base}/students/${c.student.id}/report-card`} className="font-semibold text-royal text-sm">
                  Report card →
                </Link>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <p className="rounded-lg bg-mist px-3 py-2">
                  <strong>Average this term:</strong>{" "}
                  {c.average !== null ? `${c.average.toFixed(1)}/100 (${gradeFor(c.average)})` : "No scores yet"}
                </p>
                <p className="rounded-lg bg-mist px-3 py-2">
                  <strong>Attendance:</strong> {c.attPct !== null ? `${c.attPct}% (${c.attText})` : c.attText}
                </p>
                <p className="rounded-lg bg-mist px-3 py-2">
                  <strong>Fees balance:</strong> ₦{(c.bills - c.paid - c.onlinePaid).toLocaleString()}
                </p>
              </div>
              {!isPreview && me && schoolId && (
                <GameAccessControl
                  schoolId={schoolId}
                  parentId={me.id}
                  studentId={c.student.id}
                  studentName={`${c.student.first_name} ${c.student.last_name}`}
                />
              )}
              <h3 className="mb-2 mt-4 text-sm font-semibold">About {c.student.first_name} - as filled in by {c.student.first_name}</h3>
              <div className="rounded-lg bg-mist px-3 py-2">
                <BioFieldsList bio={c.bio} classTeacherName={c.classTeacherName} />
              </div>
              <h3 className="mb-2 mt-4 text-sm font-semibold">Results this term</h3>
              {c.scores.length === 0 ? (
                <p className="text-sm text-slate-500">No scores yet this term.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {c.scores.map((s) => (
                    <li key={s.subject} className="flex justify-between rounded-lg bg-mist px-3 py-1.5">
                      <span>{s.subject}</span>
                      <strong>{s.total}/100 ({s.grade}) - {plainGrade(s.total)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mb-2 mt-4 text-sm font-semibold">Homework</h3>
              {c.homework.length === 0 ? (
                <p className="text-sm text-slate-500">No homework set right now.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {c.homework.map((h) => (
                    <li key={h.id} className="rounded-lg bg-mist px-3 py-1.5">
                      <strong>{h.title}</strong>
                      <span className="text-slate-500"> · {h.subject_id ? subjects[h.subject_id] ?? "" : "General"} · Due {h.due_date ?? "-"}</span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mb-2 mt-4 text-sm font-semibold">Timetable - {c.className}</h3>
              <TimetableView
                schoolId={schoolId ?? ""}
                classIds={c.student.class_id ? [c.student.class_id] : []}
                classNames={Object.fromEntries(classes.map((x) => [x.id, x.name]))}
                teacherNames={teachers}
              />
            </Card>
          ))}
        </div>
      )}

      {tab === "fees" &&
        (isPending ? (
          <LockedNotice what="Fees & Receipts" />
        ) : (
          selected && (
            <FeesSection
              schoolId={schoolId ?? ""}
              children={children}
              selectedId={selected.student.id}
              onSelect={setSelectedChild}
              term={term}
            />
          )
        ))}

      {tab === "messages" &&
        (isPending ? (
          <LockedNotice what="Messages" />
        ) : (
          me && (
            <MessagesPanel
              schoolId={schoolId ?? ""}
              identity={{ senderRole: "Parent", teacherId: null, studentId: null, parentId: me.id }}
              studentOptions={childIds}
              studentLabels={childLabels}
            />
          )
        ))}

      {tab === "complaints" &&
        (isPending ? (
          <LockedNotice what="Complaints & Queries" />
        ) : (
          me && (
            <ComplaintWizard
              schoolId={schoolId ?? ""}
              raisedBy="Parent"
              reporterName={`${me.first_name} ${me.last_name}`}
              studentOptions={childIds}
              studentLabels={childLabels}
            />
          )
        ))}

      {tab === "helper" &&
        (isPending ? (
          <LockedNotice what="AI Parent Helper" />
        ) : (
          me && <ParentHelperSection schoolId={schoolId ?? ""} children={children} term={term} />
        ))}

      {tab === "summaries" &&
        (isPending ? (
          <LockedNotice what="Weekly Summaries" />
        ) : (
          <Card>
          <h2 className="mb-3 font-semibold">Weekly summaries</h2>
          <p className="mb-3 text-sm text-slate-500">Plain-language weekly summaries the school has shared with you.</p>
          {summaries.length === 0 ? (
            <p className="text-sm text-slate-500">No weekly summaries shared yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {summaries.map((s) => (
                <li key={s.id} className="rounded-lg bg-mist px-3 py-2">
                  <strong>{childLabels[s.student_id] ?? ""}</strong>
                  <span className="block text-xs text-slate-500">Week starting {s.week_start}</span>
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">{s.summary_text}</p>
                  {s.school_note && <p className="mt-1 text-slate-600"><strong>School note:</strong> {s.school_note}</p>}
                </li>
              ))}
            </ul>
          )}
          </Card>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------- fees

function FeesSection({
  schoolId, children, selectedId, onSelect, term,
}: {
  schoolId: string;
  children: ChildData[];
  selectedId: string;
  onSelect: (id: string) => void;
  term: Term | null;
}) {
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("Card");
  const [msg, setMsg] = useState("");
  const [receipts, setReceipts] = useState<{ id: string; amount: number; channel: string; reference: string; status: string; created_at: string }[]>([]);
  const child = children.find((c) => c.student.id === selectedId) ?? children[0];

  const loadReceipts = async (studentId: string) => {
    const { data } = await supabase
      .from("fee_online_payments")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    setReceipts((data as typeof receipts | null) ?? []);
  };
  useEffect(() => {
    if (child) loadReceipts(child.student.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, child?.student.id]);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!child || !Number.isFinite(value) || value <= 0) {
      setMsg("Enter an amount above ₦0.");
      return;
    }
    const ref = await nextPaymentRef(schoolId);
    const { error } = await supabase.from("fee_online_payments").insert({
      school_id: schoolId,
      student_id: child.student.id,
      term_id: term?.id ?? null,
      amount: value,
      channel,
      reference: ref,
      paystack_reference: null,
      status: "Paid",
    });
    if (error) {
      setMsg(`Test checkout failed: ${error.message}`);
      return;
    }
    setMsg(`Test payment recorded - ${ref}, ₦${value.toLocaleString()} by ${channel}. No real money moved.`);
    setAmount("");
    loadReceipts(child.student.id);
  };

  if (!child) return <Card><p className="text-sm text-slate-500">No children linked yet.</p></Card>;
  const balance = child.bills - child.paid - child.onlinePaid;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-semibold">Fees &amp; receipts</h2>
        <div>
          <label className={labelCls}>Child</label>
          <select className={inputCls} value={selectedId} onChange={(e) => onSelect(e.target.value)}>
            {children.map((c) => (
              <option key={c.student.id} value={c.student.id}>{c.student.first_name} {c.student.last_name} · {c.className}</option>
            ))}
          </select>
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <p className="flex justify-between"><span>Billed this term:</span><strong>₦{child.bills.toLocaleString()}</strong></p>
          <p className="flex justify-between"><span>Paid (cash / bank / card):</span><strong>₦{child.paid.toLocaleString()}</strong></p>
          <p className="flex justify-between"><span>Paid online:</span><strong>₦{child.onlinePaid.toLocaleString()}</strong></p>
          <p className="flex justify-between border-t border-line pt-1"><span>Balance:</span><strong>₦{balance.toLocaleString()}</strong></p>
        </div>
        <h3 className="mb-2 mt-4 text-sm font-semibold">Online payment receipts (test)</h3>
        {receipts.length === 0 ? (
          <p className="text-sm text-slate-500">No online payments yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {receipts.map((r) => (
              <li key={r.id} className="flex justify-between rounded-lg bg-mist px-3 py-1.5">
                <span>{r.reference} · {r.channel} · {new Date(r.created_at).toLocaleDateString()}</span>
                <strong>₦{Number(r.amount).toLocaleString()} · {r.status}</strong>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Pay online - test checkout</h2>
        <p className="mb-3 text-sm text-slate-500">
          <strong>Test checkout - no real money moves.</strong> This records a test payment in the school&apos;s records. Real card payments need live Paystack keys, which are not connected yet.
        </p>
        <form onSubmit={pay} className="space-y-3">
          <div>
            <label className={labelCls}>Amount (₦)</label>
            <input className={inputCls} value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000" />
          </div>
          <div>
            <label className={labelCls}>Channel</label>
            <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option>Card</option><option>Bank transfer</option>
            </select>
          </div>
          <button className={btnCls}>Pay ₦{(Number(amount) || 0).toLocaleString()} (test)</button>
        </form>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
        <p className="mt-3 text-xs text-slate-400">
          Paying for {child.student.first_name} {child.student.last_name} · {term ? `${term.session} - ${term.name}` : "current term"}. A receipt reference (PAY-…) is generated for every test payment.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- AI Parent Helper

function ParentHelperSection({
  schoolId, children, term,
}: {
  schoolId: string;
  children: ChildData[];
  term: Term | null;
}) {
  const [childId, setChildId] = useState(children[0]?.student.id ?? "");
  const [drafts, setDrafts] = useState<{ id: string; title: string; content: string; created_at: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [aiLive, setAiLive] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchAiLive().then(setAiLive); }, []);

  const load = async () => {
    const { data } = await supabase
      .from("ai_drafts")
      .select("*")
      .eq("school_id", schoolId)
      .eq("kind", "parent_summary")
      .order("created_at", { ascending: false })
      .limit(10);
    setDrafts((data as typeof drafts | null) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId]);
  useEffect(() => {
    if (children.length > 0 && !childId) setChildId(children[0].student.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  const generate = async () => {
    const child = children.find((c) => c.student.id === childId);
    if (!child || busy) return;
    const best = [...child.scores].sort((a, b) => b.total - a.total)[0];
    const worst = [...child.scores].sort((a, b) => a.total - b.total)[0];
    // Demo template, unchanged from before - used when no AI key is
    // configured, or when live AI fails.
    const demoContent = `PLAIN-LANGUAGE PROGRESS - demo draft, no live AI. Built from ${child.student.first_name}'s real scores and attendance this term.\n\n${child.student.first_name} ${child.student.last_name} (${child.className}${term ? `, ${term.session} - ${term.name}` : ""})\n\nOverall: ${child.average !== null ? `averaging ${child.average.toFixed(1)} out of 100 across ${child.scores.length} subject(s).` : "no scores recorded yet this term."}\nAttendance: ${child.attPct !== null ? `${child.attPct}% (${child.attText}).` : "no register days yet."}\n${best ? `Strongest subject: ${best.subject} - ${best.total}/100, ${plainGrade(best.total)}.` : ""}\n${worst && worst !== best ? `Needs the most help: ${worst.subject} - ${worst.total}/100, ${plainGrade(worst.total)}.` : ""}\n\nWhat this means: ${child.average !== null && child.average >= 60 ? "things are going well - keep the routine steady." : child.average !== null ? "there is room to improve - a short daily practice in the weakest subject will help most." : "ask the class teacher what to practise first."}\n\nIf anything here looks wrong, ask the class teacher - the scores on the report card are the final word.`;
    const context = `${child.student.first_name} ${child.student.last_name} (${child.className}${term ? `, ${term.session} - ${term.name}` : ""}). Overall: ${child.average !== null ? `averaging ${child.average.toFixed(1)} out of 100 across ${child.scores.length} subject(s)` : "no scores recorded yet this term"}. Attendance: ${child.attPct !== null ? `${child.attPct}% (${child.attText})` : "no register days yet"}.${best ? ` Strongest subject: ${best.subject} - ${best.total}/100.` : ""}${worst && worst !== best ? ` Needs the most help: ${worst.subject} - ${worst.total}/100.` : ""}`;
    setBusy(true);
    try {
      const ai = await requestAiDraft({
        kind: "parent_summary",
        prompt: `Explain ${child.student.first_name}'s progress this term in plain language for their parent.`,
        context,
      });
      const content =
        ai.demo === false && ai.text
          ? `${AI_LIVE_DRAFT_PREFIX}\n\n${ai.text}`
          : demoContent;
      const { error } = await supabase.from("ai_drafts").insert({
        school_id: schoolId,
        kind: "parent_summary",
        title: `Progress summary: ${child.student.first_name} ${child.student.last_name}`,
        content,
        status: "Draft",
        student_id: child.student.id,
        class_id: child.student.class_id ?? null,
      });
      setMsg(
        error
          ? `Could not save: ${error.message}`
          : ai.demo === false && ai.text === null
            ? `${ai.error} Demo summary saved below.`
            : "Progress summary saved below.",
      );
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-1 font-semibold">AI Parent Helper</h2>
        <p className="mb-3 text-sm text-slate-500">
          Plain-language progress, built from your child&apos;s real scores and attendance. {aiLive ? AI_LIVE_NOTE : "Demo only - no live AI is connected."}
        </p>
        <div>
          <label className={labelCls}>Child</label>
          <select className={inputCls} value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => (
              <option key={c.student.id} value={c.student.id}>{c.student.first_name} {c.student.last_name}</option>
            ))}
          </select>
        </div>
        <button className={`${btnCls} mt-3`} onClick={generate} disabled={busy}>{busy ? "Explaining..." : "Explain my child's progress"}</button>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Progress summaries</h2>
        {drafts.length === 0 ? <p className="text-sm text-slate-500">Nothing yet - generate one for a child.</p> : (
          <ul className="space-y-2 text-sm">
            {drafts.map((d) => (
              <li key={d.id} className="rounded-lg bg-mist px-3 py-2">
                <strong>{d.title}</strong>
                <span className="block text-xs text-slate-500">{new Date(d.created_at).toLocaleDateString()}</span>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
