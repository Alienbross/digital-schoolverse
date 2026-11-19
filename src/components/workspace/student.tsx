"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type { ClassRow, Student, Subject, Term } from "@/lib/types";
import { gradeFor, ReportCardBody, ReportCardHeader } from "@/components/report-card";
import { attendancePct, fetchCurrentTerm } from "@/lib/roles";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import TimetableView from "@/components/workspace/timetable-view";
import MessagesPanel from "@/components/workspace/messages-panel";
import ComplaintWizard from "@/components/workspace/complaint-wizard";
import CbtPlayer from "@/components/workspace/cbt-player";

type Tab =
  | "subjects"
  | "homework"
  | "timetable"
  | "results"
  | "attendance"
  | "cbt"
  | "tutor"
  | "help";

const TABS: { id: Tab; label: string }[] = [
  { id: "subjects", label: "My Subjects" },
  { id: "homework", label: "Homework" },
  { id: "timetable", label: "Timetable" },
  { id: "results", label: "My Results" },
  { id: "attendance", label: "My Attendance" },
  { id: "cbt", label: "CBT Practice" },
  { id: "tutor", label: "AI Study Tutor" },
  { id: "help", label: "Help & Complaints" },
];

type ScoreRow = {
  subject: string;
  test: number | null;
  assignment: number | null;
  exam: number | null;
  total: number;
  grade: string;
  remark: string | null;
};

export default function StudentWorkspace() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const base = useWorkspaceBase();
  const [tab, setTab] = useState<Tab>("subjects");
  const [school, setSchool] = useState<{ id: string; name: string; motto: string | null; logo_url: string | null } | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [pickerStudentId, setPickerStudentId] = useState("");
  const [cls, setCls] = useState<ClassRow | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [term, setTerm] = useState<Term | null>(null);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [att, setAtt] = useState<{ status: string; record_date: string }[]>([]);
  const [homework, setHomework] = useState<{ id: string; title: string; instructions: string | null; due_date: string | null; subject_id: string | null }[]>([]);

  const isPreview = profile?.role === "platform_owner" || profile?.role === "school_admin";
  const studentId = profile?.student_id ?? pickerStudentId;
  const me = students.find((s) => s.id === studentId);
  // Pending accounts (migration 0006) may complete their profile/setup
  // only — subjects, homework, results, attendance, CBT, tutor and
  // help stay locked until a class teacher or the admin approves them.
  const isPending = !isPreview && profile?.status === "Pending";
  const [allClasses, setAllClasses] = useState<ClassRow[]>([]);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editClass, setEditClass] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editDob, setEditDob] = useState("");
  const [setupMsg, setSetupMsg] = useState("");

  const load = async () => {
    if (!schoolId) return;
    const { data: s } = await supabase.from("schools").select("id, name, motto, logo_url").eq("id", schoolId).single();
    setSchool(s as typeof school);
    const { data: st } = await supabase.from("students").select("*").eq("school_id", schoolId).order("last_name");
    setStudents((st as Student[] | null) ?? []);
    const { data: t } = await supabase.from("teachers").select("id, first_name, last_name").eq("school_id", schoolId);
    const map: Record<string, string> = {};
    for (const r of (t as { id: string; first_name: string; last_name: string }[] | null) ?? [])
      map[r.id] = `${r.first_name} ${r.last_name}`;
    setTeachers(map);
    const { data: cl } = await supabase.from("classes").select("*").eq("school_id", schoolId).order("name");
    setAllClasses((cl as ClassRow[] | null) ?? []);
    setTerm(await fetchCurrentTerm(schoolId));
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  // Prefill the pending-setup form from my pupil record.
  /* eslint-disable react-hooks/set-state-in-effect -- prefill from the loaded record, as elsewhere in this codebase */
  useEffect(() => {
    if (me) {
      setEditFirst(me.first_name);
      setEditLast(me.last_name);
      setEditClass(me.class_id ?? "");
      setEditGender(me.gender ?? "");
      setEditDob(me.date_of_birth ?? "");
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMyDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || !editFirst.trim() || !editLast.trim()) return;
    const { error } = await supabase
      .from("students")
      .update({
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        class_id: editClass || null,
        gender: editGender || null,
        date_of_birth: editDob || null,
      })
      .eq("id", me.id);
    setSetupMsg(error ? `Could not save: ${error.message}` : "Your details are saved.");
    if (!error) load();
  };

  // Everything about this pupil, once we know who they are.
  useEffect(() => {
    if (!me || !term) return;
    (async () => {
      if (me.class_id) {
        const { data: c } = await supabase.from("classes").select("*").eq("id", me.class_id).maybeSingle();
        setCls((c as ClassRow | null) ?? null);
        const { data: cs } = await supabase
          .from("class_subjects")
          .select("subject_id, subjects(id, name, code)")
          .eq("class_id", me.class_id);
        setSubjects(
          ((cs as { subjects: Subject | null }[] | null) ?? [])
            .map((r) => r.subjects)
            .filter((s): s is Subject => !!s),
        );
        const { data: hw } = await supabase
          .from("homework_assignments")
          .select("*")
          .eq("class_id", me.class_id)
          .eq("status", "Active")
          .order("due_date", { ascending: true });
        setHomework((hw as typeof homework | null) ?? []);
      }
      const { data: sc } = await supabase
        .from("score_records")
        .select("*, subjects(name)")
        .eq("student_id", me.id)
        .eq("term_id", term.id);
      const rows = ((sc as { test_score: number | null; assignment_score: number | null; exam_score: number | null; remark: string | null; subjects: { name: string } | null }[] | null) ?? []).map((r) => {
        const total = (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
        return {
          subject: r.subjects?.name ?? "—",
          test: r.test_score,
          assignment: r.assignment_score,
          exam: r.exam_score,
          total,
          grade: gradeFor(total),
          remark: r.remark,
        };
      });
      setScores(rows.sort((a, b) => a.subject.localeCompare(b.subject)));
      const { data: a } = await supabase
        .from("attendance_records")
        .select("status, record_date")
        .eq("student_id", me.id)
        .eq("term_id", term.id)
        .order("record_date", { ascending: false });
      setAtt((a as typeof att | null) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, term?.id]);

  const attStats = useMemo(() => attendancePct(att), [att]);
  const average = scores.length > 0 ? scores.reduce((s, r) => s + r.total, 0) / scores.length : null;
  const subjectNames: Record<string, string> = {};
  for (const s of subjects) subjectNames[s.id] = s.name;

  if (!studentId && !authLoading) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Student workspace" sub="Your subjects, homework, results and practice." />
        {isPreview ? (
          <Card>
            <p className="text-sm">You are signed in as {profile?.role.replace("_", " ")}. Pick a pupil to preview their workspace:</p>
            <select className={`${inputCls} mt-3 max-w-sm`} value={pickerStudentId} onChange={(e) => setPickerStudentId(e.target.value)}>
              <option value="">— Choose a pupil —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.admission_no}</option>
              ))}
            </select>
            {students.length === 0 && <p className="mt-2 text-sm text-slate-500">No pupils in this school yet — add them under Students first.</p>}
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-slate-500">
              Your login is not linked to a pupil record yet. Ask your school admin to link your account to your pupil record (via an invite), then sign in again.
            </p>
          </Card>
        )}
      </div>
    );
  }

  // Pending setup only: complete your details while you wait for
  // approval. Subjects, homework, results, attendance, CBT, tutor
  // and help stay locked until a class teacher or the admin approves.
  if (isPending && me) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader
          title={`Student workspace — ${me.first_name} ${me.last_name}`}
          sub={`${me.admission_no} · Complete your details while you wait for approval.`}
        />
        <div className="max-w-lg">
          {setupMsg && <p className="mb-4 text-sm font-medium text-royal">{setupMsg}</p>}
          <Card>
            <h2 className="mb-3 font-semibold">My details</h2>
            <form onSubmit={saveMyDetails} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>First name</label><input className={inputCls} value={editFirst} onChange={(e) => setEditFirst(e.target.value)} /></div>
                <div><label className={labelCls}>Last name</label><input className={inputCls} value={editLast} onChange={(e) => setEditLast(e.target.value)} /></div>
              </div>
              <div>
                <label className={labelCls}>My class</label>
                <select className={inputCls} value={editClass} onChange={(e) => setEditClass(e.target.value)}>
                  <option value="">— Choose your class —</option>
                  {allClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.arm ? ` · Arm ${c.arm}` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Gender</label>
                  <select className={inputCls} value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                    <option value="">—</option>
                    <option>Female</option>
                    <option>Male</option>
                  </select>
                </div>
                <div><label className={labelCls}>Date of birth</label><input className={inputCls} type="date" value={editDob} onChange={(e) => setEditDob(e.target.value)} /></div>
              </div>
              <button className={btnCls}>Save my details</button>
            </form>
          </Card>
          <p className="mt-4 text-sm text-slate-500">
            Your subjects, homework, results, attendance, CBT practice, AI
            tutor and help open once your class teacher or the school admin
            approves your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title={`Student workspace${me ? ` — ${me.first_name} ${me.last_name}` : ""}`}
        sub={me ? `${cls?.name ?? "No class assigned yet"} · ${me.admission_no}${term ? ` · ${term.session} — ${term.name}` : ""}` : "Your subjects, homework, results and practice."}
      />
      {isPreview && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <label className="font-semibold text-slate-600">Viewing as pupil:</label>
          <select className={`${inputCls} max-w-xs`} value={pickerStudentId} onChange={(e) => setPickerStudentId(e.target.value)}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.admission_no}</option>
            ))}
          </select>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t.id ? "bg-royal text-white" : "border border-line bg-white text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "subjects" && (
        <Card>
          <h2 className="mb-3 font-semibold">My subjects{cls ? ` — ${cls.name}` : ""}</h2>
          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500">No subjects assigned to your class yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {subjects.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                  <span><strong>{s.name}</strong>{s.code ? <span className="text-xs text-slate-500"> · {s.code}</span> : null}</span>
                  <span className="text-xs text-slate-500">
                    {(() => {
                      const row = scores.find((r) => r.subject === s.name);
                      return row ? `This term: ${row.total}/100 (${row.grade})` : "No scores yet this term";
                    })()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "homework" && (
        <Card>
          <h2 className="mb-3 font-semibold">My homework</h2>
          {homework.length === 0 ? (
            <p className="text-sm text-slate-500">No homework set for your class right now.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {homework.map((h) => (
                <li key={h.id} className="rounded-lg bg-mist px-3 py-2">
                  <strong>{h.title}</strong>
                  <span className="block text-xs text-slate-500">
                    {h.subject_id ? subjectNames[h.subject_id] ?? "" : "General"} · Due {h.due_date ?? "—"}
                  </span>
                  {h.instructions && <p className="mt-1 text-slate-600">{h.instructions}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "timetable" && (
        <TimetableView
          schoolId={schoolId ?? ""}
          classIds={me?.class_id ? [me.class_id] : []}
          classNames={cls ? { [cls.id]: cls.name } : {}}
          teacherNames={teachers}
        />
      )}

      {tab === "results" && (
        <div className="space-y-4">
          <Card>
            {school && me ? (
              <>
                <ReportCardHeader school={school} termLabel={term ? `${term.session} — ${term.name}` : "Current term"} />
                <ReportCardBody
                  studentName={`${me.first_name} ${me.last_name}`}
                  admissionNo={me.admission_no}
                  className={cls?.name ?? "—"}
                  rows={scores}
                  average={average}
                  position={null}
                  positionOf={null}
                  attendancePct={attStats.pct}
                  attendanceText={attStats.total > 0 ? `${attStats.present} of ${attStats.total} days` : "No register days yet"}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">Loading your results…</p>
            )}
          </Card>
          <p className="text-sm">
            <Link href={`${base}/students/${me?.id ?? ""}/report-card`} className="font-semibold text-royal">
              Open the printable report card →
            </Link>
          </p>
        </div>
      )}

      {tab === "attendance" && (
        <Card>
          <h2 className="mb-3 font-semibold">My attendance this term</h2>
          {attStats.total === 0 ? (
            <p className="text-sm text-slate-500">No register days yet this term.</p>
          ) : (
            <>
              <p className="text-3xl font-bold text-royal">{attStats.pct}%</p>
              <p className="text-sm text-slate-500">Present or late on {attStats.present} of {attStats.total} register days.</p>
              <ul className="mt-3 space-y-1 text-sm">
                {att.slice(0, 20).map((r, i) => (
                  <li key={i} className="flex justify-between rounded-lg bg-mist px-3 py-1.5">
                    <span>{r.record_date}</span>
                    <strong>{r.status}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {tab === "cbt" && (
        <CbtPlayer
          schoolId={schoolId ?? ""}
          studentId={me?.id ?? ""}
          classId={me?.class_id ?? null}
          subjectNames={subjectNames}
        />
      )}

      {tab === "tutor" && me && (
        <StudyTutorSection schoolId={schoolId ?? ""} studentId={me.id} subjects={subjects} />
      )}

      {tab === "help" && me && (
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Need help?</h2>
            <p className="mt-1 text-sm text-slate-600">
              If someone is hurting you, threatening you, or making you feel unsafe — at school or online — tell a teacher or a trusted adult in person right away. You can also use the form below: choose <strong>Bullying</strong> and it goes straight to a senior staff member as <strong>Urgent</strong>.
            </p>
          </Card>
          <ComplaintWizard
            schoolId={schoolId ?? ""}
            raisedBy="Student"
            reporterName={`${me.first_name} ${me.last_name}`}
            studentOptions={[me.id]}
            studentLabels={{ [me.id]: `${me.first_name} ${me.last_name}` }}
            defaultStudentId={me.id}
          />
          <MessagesPanel
            schoolId={schoolId ?? ""}
            identity={{ senderRole: "Student", teacherId: null, studentId: me.id, parentId: null }}
            studentOptions={[me.id]}
            studentLabels={{ [me.id]: `${me.first_name} ${me.last_name}` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- AI Study Tutor

function StudyTutorSection({
  schoolId, studentId, subjects,
}: {
  schoolId: string;
  studentId: string;
  subjects: Subject[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [drafts, setDrafts] = useState<{ id: string; title: string; content: string; created_at: string }[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("ai_drafts")
      .select("*")
      .eq("school_id", schoolId)
      .eq("kind", "study_help")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(10);
    setDrafts((data as typeof drafts | null) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId, studentId]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const subj = subjects.find((s) => s.id === subjectId)?.name ?? "your subject";
    const content = `STUDY HELP — demo draft, no live AI. Your teacher can check this with you.\n\nYou asked (${subj}): ${question.trim()}\n\nHow to work it out:\n1. Say what the question is asking in your own words.\n2. Write down what you already know about it.\n3. Try one small step — then check it.\n4. If you get stuck, write down exactly where you got stuck and ask your teacher that part.\n\nQuick check for yourself: can you explain the answer to a friend? If not, try step 1 again.`;
    const { error } = await supabase.from("ai_drafts").insert({
      school_id: schoolId,
      kind: "study_help",
      title: `${subj}: ${question.trim().slice(0, 60)}`,
      content,
      status: "Draft",
      subject_id: subjectId || null,
      student_id: studentId,
    });
    setMsg(error ? `Could not save: ${error.message}` : "Saved below. This is a study guide, not the answer — work through the steps.");
    setQuestion("");
    load();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-1 font-semibold">AI Study Tutor</h2>
        <p className="mb-3 text-sm text-slate-500">
          Demo only — no live AI is connected. It gives you steps to work a question out yourself, not the answer, and your teacher can see what you asked.
        </p>
        <form onSubmit={ask} className="space-y-3">
          <div>
            <label className={labelCls}>Subject</label>
            <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>What are you stuck on?</label>
            <textarea className={inputCls} rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. I don't understand how to add fractions with different denominators" />
          </div>
          <button className={btnCls}>Get study help</button>
        </form>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">My study help</h2>
        {drafts.length === 0 ? <p className="text-sm text-slate-500">Nothing yet — ask your first question.</p> : (
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
