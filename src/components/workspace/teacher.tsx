"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type { ClassRow, ClassSubject, Student, Subject, Teacher, Term } from "@/lib/types";
import { gradeFor } from "@/components/report-card";
import {
  ATTENDANCE_STATUSES,
  fetchCurrentTerm,
  plainGrade,
  todayStr,
  type AttendanceStatus,
} from "@/lib/roles";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import { LockedNotice } from "@/components/pending-banner";
import ApprovalsList from "@/components/workspace/approvals";
import TimetableView from "@/components/workspace/timetable-view";
import MessagesPanel from "@/components/workspace/messages-panel";
import ComplaintWizard from "@/components/workspace/complaint-wizard";

type Tab =
  | "classes"
  | "attendance"
  | "scores"
  | "lessons"
  | "homework"
  | "timetable"
  | "cbt"
  | "messages"
  | "complaints"
  | "ai"
  | "approvals";

const TABS: { id: Tab; label: string }[] = [
  { id: "classes", label: "My Classes" },
  { id: "attendance", label: "Attendance" },
  { id: "scores", label: "Scores & Results" },
  { id: "lessons", label: "Lesson Notes" },
  { id: "homework", label: "Homework" },
  { id: "timetable", label: "Timetable" },
  { id: "cbt", label: "CBT Practice Tests" },
  { id: "messages", label: "Messages" },
  { id: "complaints", label: "Complaints" },
  { id: "ai", label: "AI Teacher Assistant" },
  { id: "approvals", label: "Approvals" },
];

type ScoreRow = { test: string; assignment: string; exam: string };

type AiDraft = {
  id: string;
  kind: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
};

const AI_NOTE =
  "Demo draft — no live AI is connected. This is a template draft built from the details you entered. Review it, edit it, and approve it before using it. AI never changes a grade.";

export default function TeacherWorkspace() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const base = useWorkspaceBase();
  const [tab, setTab] = useState<Tab>("classes");
  const [schoolName, setSchoolName] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [pickerTeacherId, setPickerTeacherId] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [msg, setMsg] = useState("");

  // The teacher this workspace is for: the signed-in teacher, or — for
  // the platform owner / school admin previewing — a teacher they pick.
  const isPreview = profile?.role === "platform_owner" || profile?.role === "school_admin";
  const teacherId = profile?.teacher_id ?? pickerTeacherId;
  const me = teachers.find((t) => t.id === teacherId);
  // Pending accounts (migration 0006) may complete their profile/setup
  // only. Registers, scores, messages and the rest stay locked until
  // the school admin approves them.
  const isPending = !isPreview && profile?.status === "Pending";
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const loadBase = async () => {
    if (!schoolId) return;
    const { data: s } = await supabase.from("schools").select("name").eq("id", schoolId).single();
    setSchoolName((s as { name: string } | null)?.name ?? "");
    const { data: t } = await supabase.from("teachers").select("*").eq("school_id", schoolId).order("last_name");
    setTeachers((t as Teacher[] | null) ?? []);
    const { data: c } = await supabase.from("classes").select("*").eq("school_id", schoolId).order("name");
    setClasses((c as ClassRow[] | null) ?? []);
    const { data: sub } = await supabase.from("subjects").select("*").eq("school_id", schoolId).order("name");
    setSubjects((sub as Subject[] | null) ?? []);
    const { data: cs } = await supabase.from("class_subjects").select("*");
    setClassSubjects((cs as ClassSubject[] | null) ?? []);
    const { data: st } = await supabase.from("students").select("*").eq("school_id", schoolId).order("last_name");
    setStudents((st as Student[] | null) ?? []);
    setTerm(await fetchCurrentTerm(schoolId));
  };

  useEffect(() => {
    if (isSupabaseConfigured && !authLoading) loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  /* eslint-disable react-hooks/set-state-in-effect -- prefill from the loaded record, as elsewhere in this codebase */
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
      .from("teachers")
      .update({
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        phone: editPhone.trim() || null,
      })
      .eq("id", me.id);
    setMsg(error ? `Could not save: ${error.message}` : "Your details are saved.");
    if (!error) loadBase();
  };

  // Classes I teach: subjects assigned to me, plus classes where I am
  // the class teacher.
  const myClassIds = useMemo(() => {
    if (!teacherId) return [];
    const ids = new Set<string>();
    for (const cs of classSubjects) if (cs.teacher_id === teacherId) ids.add(cs.class_id);
    for (const c of classes) if (c.class_teacher_id === teacherId) ids.add(c.id);
    return [...ids];
  }, [teacherId, classSubjects, classes]);

  const myClasses = classes.filter((c) => myClassIds.includes(c.id));
  const mySubjectIds = useMemo(() => {
    if (!teacherId) return new Set<string>();
    return new Set(classSubjects.filter((cs) => cs.teacher_id === teacherId).map((cs) => cs.subject_id));
  }, [teacherId, classSubjects]);

  const subjectsOf = (classId: string) =>
    classSubjects
      .filter((cs) => cs.class_id === classId)
      .map((cs) => subjects.find((s) => s.id === cs.subject_id))
      .filter((s): s is Subject => !!s);
  const pupilsOf = (classId: string) => students.filter((s) => s.class_id === classId);
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? "—";
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";
  const pupilName = (s: Student) => `${s.first_name} ${s.last_name}`;
  const teacherNames: Record<string, string> = {};
  for (const t of teachers) teacherNames[t.id] = `${t.first_name} ${t.last_name}`;
  const pupilLabels: Record<string, string> = {};
  for (const s of students) pupilLabels[s.id] = `${pupilName(s)} · ${className(s.class_id ?? "")}`;

  if (!teacherId && !authLoading) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Teacher workspace" sub="Your classes, registers, scores and lesson notes." />
        {isPreview ? (
          <Card>
            <p className="text-sm">You are signed in as {profile?.role.replace("_", " ")}. Pick a teacher to preview their workspace:</p>
            <select className={`${inputCls} mt-3 max-w-sm`} value={pickerTeacherId} onChange={(e) => setPickerTeacherId(e.target.value)}>
              <option value="">— Choose a teacher —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
              ))}
            </select>
            {teachers.length === 0 && <p className="mt-2 text-sm text-slate-500">No teachers in this school yet — add them under Teachers &amp; Staff first.</p>}
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-slate-500">
              Your login is not linked to a teacher record yet. Ask your school admin to link your account to your teacher record (via an invite), then sign in again.
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
        title={`Teacher workspace${me ? ` — ${me.first_name} ${me.last_name}` : ""}`}
        sub={schoolName || "Your classes, registers, scores and lesson notes."}
      />
      {isPreview && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <label className="font-semibold text-slate-600">Viewing as teacher:</label>
          <select className={`${inputCls} max-w-xs`} value={pickerTeacherId} onChange={(e) => setPickerTeacherId(e.target.value)}>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.filter((t) => {
          // Approvals only for teachers who can actually decide
          // something: a class teacher, or senior staff. Never while
          // this teacher's own account is still pending.
          if (t.id === "approvals")
            return !isPending && (myClassIds.length > 0 || !!me?.can_approve_parents);
          return true;
        }).map((t) => {
          const locked = !!isPending && t.id !== "classes";
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
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      {isPending && tab !== "classes" && (
        <LockedNotice what="This part of the teacher workspace" />
      )}

      {tab === "classes" && (
        <div className="space-y-4">
          {isPending && me && (
            <Card>
              <h2 className="mb-1 font-semibold">My profile</h2>
              <p className="mb-3 text-sm text-slate-500">
                Complete your details while you wait for approval. The school
                admin assigns your subjects and classes — those show below
                once assigned.
              </p>
              <form onSubmit={saveMyDetails} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>First name</label><input className={inputCls} value={editFirst} onChange={(e) => setEditFirst(e.target.value)} /></div>
                  <div><label className={labelCls}>Last name</label><input className={inputCls} value={editLast} onChange={(e) => setEditLast(e.target.value)} /></div>
                </div>
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
                <button className={btnCls}>Save my details</button>
              </form>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
          {myClasses.length === 0 && (
            <Card><p className="text-sm text-slate-500">No classes assigned to you yet. The school admin assigns subjects and class teachers under Classes &amp; Arms and Subjects.</p></Card>
          )}
          {myClasses.map((c) => {
            const subs = subjectsOf(c.id);
            const pupils = pupilsOf(c.id);
            const isFormTeacher = c.class_teacher_id === teacherId;
            return (
              <Card key={c.id}>
                <h2 className="font-semibold">{c.name} {isFormTeacher && <span className="ml-1 rounded-full bg-royal px-2 py-0.5 text-xs text-white">Class teacher</span>}</h2>
                <p className="mt-1 text-sm text-slate-500">{c.stage}{c.arm ? ` · Arm ${c.arm}` : ""} · {pupils.length} pupil{pupils.length === 1 ? "" : "s"}</p>
                <p className="mt-2 text-sm"><strong>Subjects I teach here:</strong> {subs.filter((s) => mySubjectIds.has(s.id) || isFormTeacher).map((s) => s.name).join(", ") || "—"}</p>
                <p className="mt-1 text-sm text-slate-500">All subjects in this class: {subs.map((s) => s.name).join(", ") || "None assigned yet"}</p>
                <div className="mt-3 flex gap-2">
                  <button className={btnCls} onClick={() => setTab("attendance")}>Take register →</button>
                  <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold" onClick={() => setTab("scores")}>Enter scores →</button>
                </div>
              </Card>
            );
          })}
          </div>
        </div>
      )}

      {tab === "attendance" && !isPending && (
        <AttendanceSection
          schoolId={schoolId ?? ""}
          myClasses={myClasses}
          pupilsOf={pupilsOf}
          term={term}
          onSaved={() => setMsg("Register saved.")}
        />
      )}

      {tab === "scores" && !isPending && (
        <ScoresSection
          schoolId={schoolId ?? ""}
          myClasses={myClasses}
          subjectsOf={subjectsOf}
          pupilsOf={pupilsOf}
          term={term}
          base={base}
        />
      )}

      {tab === "lessons" && !isPending && (
        <LessonNotesSection schoolId={schoolId ?? ""} myClasses={myClasses} subjectsOf={subjectsOf} />
      )}

      {tab === "homework" && !isPending && (
        <HomeworkSection schoolId={schoolId ?? ""} teacherId={teacherId ?? ""} myClasses={myClasses} subjectsOf={subjectsOf} term={term} />
      )}

      {tab === "timetable" && !isPending && (
        <TimetableView
          schoolId={schoolId ?? ""}
          classIds={myClassIds}
          classNames={Object.fromEntries(classes.map((c) => [c.id, c.name]))}
          teacherNames={teacherNames}
        />
      )}

      {tab === "cbt" && !isPending && (
        <CbtBuilderSection schoolId={schoolId ?? ""} myClasses={myClasses} subjectsOf={subjectsOf} subjectName={subjectName} />
      )}

      {tab === "messages" && !isPending && (
        <MessagesPanel
          schoolId={schoolId ?? ""}
          identity={{ senderRole: "Teacher", teacherId: teacherId ?? null, studentId: null, parentId: null }}
          studentOptions={students.filter((s) => myClassIds.includes(s.class_id ?? "")).map((s) => s.id)}
          studentLabels={pupilLabels}
        />
      )}

      {tab === "complaints" && !isPending && (
        <div className="space-y-4">
          <ComplaintWizard
            schoolId={schoolId ?? ""}
            raisedBy="Teacher"
            reporterName={me ? `${me.first_name} ${me.last_name}` : ""}
            studentOptions={students.filter((s) => myClassIds.includes(s.class_id ?? "")).map((s) => s.id)}
            studentLabels={pupilLabels}
          />
          <ComplaintList schoolId={schoolId ?? ""} pupilLabels={pupilLabels} />
        </div>
      )}

      {tab === "ai" && !isPending && (
        <AiAssistantSection
          schoolId={schoolId ?? ""}
          myClasses={myClasses}
          subjectsOf={subjectsOf}
          pupilsOf={pupilsOf}
          term={term}
          subjectName={subjectName}
          className={className}
        />
      )}

      {tab === "approvals" && !isPending && schoolId && (
        <ApprovalsList
          schoolId={schoolId}
          scope="teacher"
          myClassIds={myClassIds}
          canApproveParents={!!me?.can_approve_parents}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- attendance

function AttendanceSection({
  schoolId, myClasses, pupilsOf, term, onSaved,
}: {
  schoolId: string;
  myClasses: ClassRow[];
  pupilsOf: (classId: string) => Student[];
  term: Term | null;
  onSaved: () => void;
}) {
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const pupils = pupilsOf(classId);

  useEffect(() => {
    if (!classId) return;
    setLoaded(false);
    (async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("class_id", classId)
        .eq("record_date", date);
      const map: Record<string, AttendanceStatus> = {};
      for (const r of (data as { student_id: string; status: string }[] | null) ?? [])
        map[r.student_id] = r.status as AttendanceStatus;
      setMarks(map);
      setLoaded(true);
    })();
  }, [classId, date]);

  useEffect(() => {
    if (myClasses.length > 0 && !classId) setClassId(myClasses[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myClasses]);

  const counts = ATTENDANCE_STATUSES.map((s) => ({
    s,
    n: pupils.filter((p) => marks[p.id] === s).length,
  }));

  const save = async () => {
    const unmarked = pupils.filter((p) => !marks[p.id]);
    if (unmarked.length > 0) {
      setMsg(`${unmarked.length} pupil(s) still unmarked — mark everyone or use “Mark all present” first.`);
      return;
    }
    setSaving(true);
    const rows = pupils.map((p) => ({
      school_id: schoolId,
      class_id: classId,
      student_id: p.id,
      term_id: term?.id ?? null,
      record_date: date,
      status: marks[p.id],
    }));
    const { error } = await supabase
      .from("attendance_records")
      .upsert(rows, { onConflict: "student_id,record_date" });
    setSaving(false);
    if (error) {
      setMsg(`Could not save the register: ${error.message}`);
      return;
    }
    setMsg(`Register saved for ${date} — ${pupils.length} pupils. Saving again updates the same day in place.`);
    onSaved();
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-3">
        <div>
          <label className={labelCls}>Class</label>
          <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold" onClick={() => {
            const next: Record<string, AttendanceStatus> = {};
            for (const p of pupils) next[p.id] = "Present";
            setMarks(next);
          }}>
            Mark all present
          </button>
          <button className={btnCls} disabled={saving || !loaded} onClick={save}>Save register</button>
        </div>
      </div>
      {term && <p className="mb-3 text-xs text-slate-500">Term: {term.session} — {term.name}</p>}
      {msg && <p className="mb-3 text-sm font-medium text-royal">{msg}</p>}
      {!loaded ? (
        <p className="text-sm text-slate-500">Loading register…</p>
      ) : pupils.length === 0 ? (
        <p className="text-sm text-slate-500">No pupils in this class yet.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">{counts.map((c) => `${c.s}: ${c.n}`).join(" · ")} · {pupils.filter((p) => !marks[p.id]).length} unmarked</p>
          <ul className="space-y-2 text-sm">
            {pupils.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
                <span><strong>{p.first_name} {p.last_name}</strong> <span className="text-xs text-slate-500">{p.admission_no}</span></span>
                <span className="flex gap-1">
                  {ATTENDANCE_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setMarks({ ...marks, [p.id]: s })}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${marks[p.id] === s ? "bg-royal text-white" : "bg-white text-slate-600 border border-line"}`}
                    >
                      {s}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- scores

function ScoresSection({
  schoolId, myClasses, subjectsOf, pupilsOf, term, base,
}: {
  schoolId: string;
  myClasses: ClassRow[];
  subjectsOf: (classId: string) => Subject[];
  pupilsOf: (classId: string) => Student[];
  term: Term | null;
  base: string;
}) {
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState<Record<string, ScoreRow>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const subjects = subjectsOf(classId);
  const pupils = pupilsOf(classId);

  useEffect(() => {
    if (myClasses.length > 0 && !classId) setClassId(myClasses[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myClasses]);
  useEffect(() => {
    if (subjects.length > 0 && !subjectId) setSubjectId(subjects[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  useEffect(() => {
    if (!classId || !subjectId || !term) return;
    (async () => {
      const { data } = await supabase
        .from("score_records")
        .select("*")
        .eq("class_id", classId)
        .eq("subject_id", subjectId)
        .eq("term_id", term.id);
      const map: Record<string, ScoreRow> = {};
      for (const r of (data as { student_id: string; test_score: number | null; assignment_score: number | null; exam_score: number | null }[] | null) ?? [])
        map[r.student_id] = {
          test: r.test_score === null ? "" : String(r.test_score),
          assignment: r.assignment_score === null ? "" : String(r.assignment_score),
          exam: r.exam_score === null ? "" : String(r.exam_score),
        };
      setRows(map);
    })();
  }, [classId, subjectId, term]);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const valid = (v: string, max: number) => {
    if (v.trim() === "") return true;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max;
  };
  const totalOf = (r: ScoreRow) =>
    (num(r.test) ?? 0) + (num(r.assignment) ?? 0) + (num(r.exam) ?? 0);

  const anyInvalid = pupils.some((p) => {
    const r = rows[p.id] ?? { test: "", assignment: "", exam: "" };
    return !valid(r.test, 20) || !valid(r.assignment, 10) || !valid(r.exam, 70);
  });

  // Class positions by average across all subjects this term.
  const [positions, setPositions] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!term || pupils.length === 0) return;
    (async () => {
      const ids = pupils.map((p) => p.id);
      const { data } = await supabase
        .from("score_records")
        .select("student_id, test_score, assignment_score, exam_score")
        .eq("term_id", term.id)
        .in("student_id", ids);
      const totals = new Map<string, { sum: number; n: number }>();
      for (const r of (data as { student_id: string; test_score: number | null; assignment_score: number | null; exam_score: number | null }[] | null) ?? []) {
        const cur = totals.get(r.student_id) ?? { sum: 0, n: 0 };
        cur.sum += (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
        cur.n += 1;
        totals.set(r.student_id, cur);
      }
      const ranked = [...totals.entries()]
        .map(([id, t]) => ({ id, avg: t.n > 0 ? t.sum / t.n : 0 }))
        .sort((a, b) => b.avg - a.avg);
      const map: Record<string, number> = {};
      ranked.forEach((r, i) => { map[r.id] = i + 1; });
      setPositions(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, classId, rows]);

  const save = async () => {
    if (anyInvalid) {
      setMsg("Some scores are out of range — Test max 20, Assignment max 10, Exam max 70. Fix the red boxes first.");
      return;
    }
    if (!term) {
      setMsg("No current term is set — ask the school admin to mark a term current in School Setup.");
      return;
    }
    setSaving(true);
    const payload = pupils
      .filter((p) => {
        const r = rows[p.id];
        return r && (r.test.trim() !== "" || r.assignment.trim() !== "" || r.exam.trim() !== "");
      })
      .map((p) => {
        const r = rows[p.id];
        return {
          school_id: schoolId,
          class_id: classId,
          subject_id: subjectId,
          student_id: p.id,
          term_id: term.id,
          test_score: num(r.test),
          assignment_score: num(r.assignment),
          exam_score: num(r.exam),
        };
      });
    if (payload.length === 0) {
      setMsg("Nothing to save yet — enter at least one score.");
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("score_records")
      .upsert(payload, { onConflict: "student_id,subject_id,term_id" });
    setSaving(false);
    setMsg(error ? `Could not save scores: ${error.message}` : `Saved ${payload.length} score row(s). Saving again updates them in place.`);
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-3">
        <div>
          <label className={labelCls}>Class</label>
          <select className={inputCls} value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }}>
            {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Subject</label>
          <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button className={btnCls} disabled={saving || anyInvalid} onClick={save}>Save scores</button>
        </div>
      </div>
      {term ? (
        <p className="mb-3 text-xs text-slate-500">Term: {term.session} — {term.name} · Test /20 · Assignment /10 · Exam /70 · Grades: A 70+, B 60–69, C 50–59, D 45–49, E 40–44, F below 40.</p>
      ) : (
        <p className="mb-3 text-xs text-amber-700">No current term is set — scores need a current term. Ask the school admin to mark one current in School Setup.</p>
      )}
      {anyInvalid && <p className="mb-3 text-sm font-semibold text-red-700">Out-of-range scores are highlighted red and block saving.</p>}
      {msg && <p className="mb-3 text-sm font-medium text-royal">{msg}</p>}
      {pupils.length === 0 ? (
        <p className="text-sm text-slate-500">No pupils in this class yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-mist text-left">
                <th className="border border-line px-2 py-2">Pupil</th>
                <th className="border border-line px-2 py-2">Test /20</th>
                <th className="border border-line px-2 py-2">Assign. /10</th>
                <th className="border border-line px-2 py-2">Exam /70</th>
                <th className="border border-line px-2 py-2">Total /100</th>
                <th className="border border-line px-2 py-2">Grade</th>
                <th className="border border-line px-2 py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {pupils.map((p) => {
                const r = rows[p.id] ?? { test: "", assignment: "", exam: "" };
                const total = totalOf(r);
                const hasAny = r.test !== "" || r.assignment !== "" || r.exam !== "";
                const set = (k: keyof ScoreRow, v: string) => setRows({ ...rows, [p.id]: { ...r, [k]: v } });
                return (
                  <tr key={p.id}>
                    <td className="border border-line px-2 py-2 font-medium">{p.first_name} {p.last_name}</td>
                    <td className="border border-line px-2 py-2">
                      <input className={`${inputCls} w-20 ${valid(r.test, 20) ? "" : "border-red-500 bg-red-50"}`} value={r.test} inputMode="numeric" onChange={(e) => set("test", e.target.value)} />
                    </td>
                    <td className="border border-line px-2 py-2">
                      <input className={`${inputCls} w-20 ${valid(r.assignment, 10) ? "" : "border-red-500 bg-red-50"}`} value={r.assignment} inputMode="numeric" onChange={(e) => set("assignment", e.target.value)} />
                    </td>
                    <td className="border border-line px-2 py-2">
                      <input className={`${inputCls} w-20 ${valid(r.exam, 70) ? "" : "border-red-500 bg-red-50"}`} value={r.exam} inputMode="numeric" onChange={(e) => set("exam", e.target.value)} />
                    </td>
                    <td className="border border-line px-2 py-2 font-semibold">{hasAny ? total : "—"}</td>
                    <td className="border border-line px-2 py-2 font-semibold">{hasAny ? gradeFor(total) : "—"}</td>
                    <td className="border border-line px-2 py-2">{positions[p.id] ? `${positions[p.id]}${positions[p.id] === 1 ? "st" : positions[p.id] === 2 ? "nd" : positions[p.id] === 3 ? "rd" : "th"}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Pupils can see their own report cards from their workspace
            {base ? ` (${base}/student)` : ""} once scores are saved.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- lesson notes

function LessonNotesSection({
  schoolId, myClasses, subjectsOf,
}: {
  schoolId: string;
  myClasses: ClassRow[];
  subjectsOf: (classId: string) => Subject[];
}) {
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [objectives, setObjectives] = useState("");
  const [drafts, setDrafts] = useState<AiDraft[]>([]);
  const [msg, setMsg] = useState("");
  const subjects = subjectsOf(classId);

  const load = async () => {
    const { data } = await supabase
      .from("ai_drafts")
      .select("*")
      .eq("school_id", schoolId)
      .eq("kind", "lesson_notes")
      .order("created_at", { ascending: false })
      .limit(20);
    setDrafts((data as AiDraft[] | null) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId]);
  useEffect(() => {
    if (subjects.length > 0 && !subjectId) setSubjectId(subjects[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !topic.trim()) return;
    const content = `Lesson: ${title.trim()}\nTopic: ${topic.trim()}\nObjectives:\n${objectives.trim() || "(add your objectives)"}\n\n1. Introduction — what pupils should already know.\n2. Main teaching — explain the topic in small steps, with examples.\n3. Class activity — pupils practise together.\n4. Assessment — quick questions to check understanding.\n5. Homework — set from the Homework tab.`;
    const { error } = await supabase.from("ai_drafts").insert({
      school_id: schoolId,
      kind: "lesson_notes",
      title: title.trim(),
      content,
      status: "Draft",
      class_id: classId || null,
      subject_id: subjectId || null,
    });
    setMsg(error ? `Could not save: ${error.message}` : "Lesson note draft saved.");
    setTitle(""); setTopic(""); setObjectives("");
    load();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-semibold">New lesson note</h2>
        <p className="mb-3 text-xs text-slate-500">Saved as a draft you can edit later. The AI Teacher Assistant tab can draft the outline for you.</p>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className={labelCls}>Class</label>
            <select className={inputCls} value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }}>
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Subject</label>
            <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Lesson title</label><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className={labelCls}>Topic</label><input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
          <div><label className={labelCls}>Objectives (one per line)</label><textarea className={inputCls} rows={3} value={objectives} onChange={(e) => setObjectives(e.target.value)} /></div>
          <button className={btnCls}>Save draft</button>
        </form>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">My lesson note drafts</h2>
        {drafts.length === 0 ? <p className="text-sm text-slate-500">No lesson notes yet.</p> : (
          <ul className="space-y-2 text-sm">
            {drafts.map((d) => (
              <li key={d.id} className="rounded-lg bg-mist px-3 py-2">
                <strong>{d.title}</strong> <span className="text-xs text-slate-500">· {d.status} · {new Date(d.created_at).toLocaleDateString()}</span>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- homework

function HomeworkSection({
  schoolId, teacherId, myClasses, subjectsOf, term,
}: {
  schoolId: string;
  teacherId: string;
  myClasses: ClassRow[];
  subjectsOf: (classId: string) => Subject[];
  term: Term | null;
}) {
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [list, setList] = useState<{ id: string; title: string; instructions: string | null; due_date: string | null; status: string; class_id: string; subject_id: string | null }[]>([]);
  const [subjectsAll, setSubjectsAll] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const subjects = subjectsOf(classId);

  const load = async () => {
    const { data } = await supabase
      .from("homework_assignments")
      .select("*")
      .eq("school_id", schoolId)
      .in("class_id", myClasses.map((c) => c.id))
      .order("due_date", { ascending: true });
    setList((data as typeof list | null) ?? []);
    const { data: subs } = await supabase.from("subjects").select("id, name").eq("school_id", schoolId);
    const map: Record<string, string> = {};
    for (const r of (subs as { id: string; name: string }[] | null) ?? []) map[r.id] = r.name;
    setSubjectsAll(map);
  };
  useEffect(() => { if (myClasses.length > 0) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId, myClasses]);
  useEffect(() => {
    if (subjects.length > 0 && !subjectId) setSubjectId(subjects[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !classId) return;
    const { error } = await supabase.from("homework_assignments").insert({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId || null,
      teacher_id: teacherId,
      term_id: term?.id ?? null,
      title: title.trim(),
      instructions: instructions.trim() || null,
      due_date: due || null,
      status: "Active",
    });
    setMsg(error ? `Could not set homework: ${error.message}` : "Homework set — pupils in the class will see it in their workspace.");
    setTitle(""); setInstructions(""); setDue("");
    load();
  };

  const archive = async (id: string) => {
    await supabase.from("homework_assignments").update({ status: "Archived" }).eq("id", id);
    load();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-semibold">Set homework</h2>
        <form onSubmit={add} className="space-y-3">
          <div>
            <label className={labelCls}>Class</label>
            <select className={inputCls} value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }}>
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Subject</label>
            <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">— General —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Title</label><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Maths exercise 4, questions 1–10" /></div>
          <div><label className={labelCls}>Instructions</label><textarea className={inputCls} rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
          <div><label className={labelCls}>Due date</label><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <button className={btnCls}>Set homework</button>
        </form>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Homework I have set</h2>
        {list.length === 0 ? <p className="text-sm text-slate-500">Nothing set yet.</p> : (
          <ul className="space-y-2 text-sm">
            {list.map((h) => (
              <li key={h.id} className="rounded-lg bg-mist px-3 py-2">
                <strong>{h.title}</strong>
                <span className="block text-xs text-slate-500">
                  {myClasses.find((c) => c.id === h.class_id)?.name ?? ""} · {h.subject_id ? subjectsAll[h.subject_id] ?? "" : "General"} · Due {h.due_date ?? "—"} · {h.status}
                </span>
                {h.instructions && <p className="mt-1 text-slate-600">{h.instructions}</p>}
                {h.status === "Active" && (
                  <button className="mt-1 text-xs font-semibold text-royal" onClick={() => archive(h.id)}>Archive</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- CBT builder

function CbtBuilderSection({
  schoolId, myClasses, subjectsOf, subjectName,
}: {
  schoolId: string;
  myClasses: ClassRow[];
  subjectsOf: (classId: string) => Subject[];
  subjectName: (id: string | null) => string;
}) {
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("20");
  const [tests, setTests] = useState<{ id: string; title: string; class_id: string; subject_id: string | null; time_limit_minutes: number | null; qcount: number }[]>([]);
  const [openTest, setOpenTest] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [msg, setMsg] = useState("");
  const subjects = subjectsOf(classId);

  const load = async () => {
    const { data: t } = await supabase
      .from("cbt_tests")
      .select("*")
      .eq("school_id", schoolId)
      .in("class_id", myClasses.map((c) => c.id))
      .eq("mode", "Practice")
      .order("created_at", { ascending: false });
    const list = (t as { id: string; title: string; class_id: string; subject_id: string | null; time_limit_minutes: number | null }[] | null) ?? [];
    const withCounts = await Promise.all(list.map(async (x) => {
      const { count } = await supabase.from("cbt_questions").select("*", { count: "exact", head: true }).eq("test_id", x.id);
      return { ...x, qcount: count ?? 0 };
    }));
    setTests(withCounts);
  };
  useEffect(() => { if (myClasses.length > 0) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId, myClasses]);
  useEffect(() => {
    if (subjects.length > 0 && !subjectId) setSubjectId(subjects[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  const createTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !classId) return;
    const { data, error } = await supabase.from("cbt_tests").insert({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId || null,
      title: title.trim(),
      time_limit_minutes: minutes.trim() ? Number(minutes) : null,
      mode: "Practice",
      status: "Published",
    }).select("id").single();
    if (error || !data) {
      setMsg(`Could not create the test: ${error?.message ?? "unknown error"}`);
      return;
    }
    setMsg("Practice test published — add questions below.");
    setTitle("");
    setOpenTest((data as { id: string }).id);
    load();
  };

  const addQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openTest || !q.trim() || opts.some((o) => !o.trim())) {
      setMsg("Write the question and all four options first.");
      return;
    }
    const { error } = await supabase.from("cbt_questions").insert({
      test_id: openTest,
      question: q.trim(),
      options: opts.map((o) => o.trim()),
      correct_index: correct,
      marks: 1,
    });
    setMsg(error ? `Could not add the question: ${error.message}` : "Question added.");
    setQ(""); setOpts(["", "", "", ""]); setCorrect(0);
    load();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-semibold">New practice test</h2>
        <p className="mb-3 text-xs text-slate-500">Practice tests are auto-marked and never count as grades. Pupils see them in their CBT Practice tab.</p>
        <form onSubmit={createTest} className="space-y-3">
          <div>
            <label className={labelCls}>Class</label>
            <select className={inputCls} value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }}>
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Subject</label>
            <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">— General —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Title</label><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fractions practice" /></div>
          <div><label className={labelCls}>Time limit (minutes, blank = none)</label><input className={inputCls} value={minutes} inputMode="numeric" onChange={(e) => setMinutes(e.target.value)} /></div>
          <button className={btnCls}>Publish practice test</button>
        </form>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">My practice tests</h2>
        {tests.length === 0 ? <p className="text-sm text-slate-500">No practice tests yet.</p> : (
          <ul className="space-y-2 text-sm">
            {tests.map((t) => (
              <li key={t.id} className="rounded-lg bg-mist px-3 py-2">
                <strong>{t.title}</strong>
                <span className="block text-xs text-slate-500">
                  {myClasses.find((c) => c.id === t.class_id)?.name ?? ""} · {subjectName(t.subject_id)} · {t.time_limit_minutes ? `${t.time_limit_minutes} min` : "No time limit"} · {t.qcount} question{t.qcount === 1 ? "" : "s"}
                </span>
                <button className="mt-1 text-xs font-semibold text-royal" onClick={() => setOpenTest(openTest === t.id ? null : t.id)}>
                  {openTest === t.id ? "Close" : "Add questions →"}
                </button>
                {openTest === t.id && (
                  <form onSubmit={addQuestion} className="mt-2 space-y-2 border-t border-line pt-2">
                    <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question" />
                    {opts.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Option ${i + 1} is correct`} />
                        <input className={inputCls} value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}${i === correct ? " (correct)" : ""}`} />
                      </div>
                    ))}
                    <p className="text-xs text-slate-500">Tick the radio next to the correct answer.</p>
                    <button className={btnCls}>Add question</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- complaints list

function ComplaintList({
  schoolId, pupilLabels,
}: {
  schoolId: string;
  pupilLabels: Record<string, string>;
}) {
  const [rows, setRows] = useState<{ id: string; reference: string; subject: string | null; category: string; priority: string; status: string; student_id: string | null; created_at: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("complaints")
        .select("id, reference, subject, category, priority, status, student_id, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(20);
      setRows((data as typeof rows | null) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);
  // Teachers see the school's recent complaints here; resolving is
  // done by the school admin, and the status updates here.
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Recent complaints in my classes</h2>
      {rows.length === 0 ? <p className="text-sm text-slate-500">No complaints yet.</p> : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
              <span>
                <strong>{r.subject ?? "(no subject)"}</strong>
                <span className="block text-xs text-slate-500">
                  {r.reference} · {r.category} · {r.priority}
                  {r.student_id ? ` · ${pupilLabels[r.student_id] ?? ""}` : ""} · {new Date(r.created_at).toLocaleDateString()}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.priority === "Urgent" ? "bg-red-100 text-red-700" : "bg-white text-slate-600"}`}>
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-400">Complaints are resolved by the school admin — the status updates here when they do.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- AI assistant

function AiAssistantSection({
  schoolId, myClasses, subjectsOf, pupilsOf, term, subjectName, className,
}: {
  schoolId: string;
  myClasses: ClassRow[];
  subjectsOf: (classId: string) => Subject[];
  pupilsOf: (classId: string) => Student[];
  term: Term | null;
  subjectName: (id: string | null) => string;
  className: (id: string) => string;
}) {
  const [tool, setTool] = useState<"lesson_notes" | "questions" | "report_comment" | "class_summary">("lesson_notes");
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [topic, setTopic] = useState("");
  const [pupilId, setPupilId] = useState("");
  const [count, setCount] = useState("5");
  const [drafts, setDrafts] = useState<AiDraft[]>([]);
  const [msg, setMsg] = useState("");
  const subjects = subjectsOf(classId);
  const pupils = pupilsOf(classId);

  const load = async () => {
    const { data } = await supabase
      .from("ai_drafts")
      .select("*")
      .eq("school_id", schoolId)
      .in("kind", ["lesson_notes", "questions", "report_comment", "class_summary"])
      .order("created_at", { ascending: false })
      .limit(20);
    setDrafts((data as AiDraft[] | null) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId]);
  useEffect(() => {
    if (subjects.length > 0 && !subjectId) setSubjectId(subjects[0].id);
    if (pupils.length > 0 && !pupilId) setPupilId(pupils[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, pupils]);

  const saveDraft = async (kind: string, title: string, content: string, studentId: string | null) => {
    const { error } = await supabase.from("ai_drafts").insert({
      school_id: schoolId,
      kind,
      title,
      content,
      status: "Draft",
      class_id: classId || null,
      subject_id: subjectId || null,
      student_id: studentId,
    });
    setMsg(error ? `Could not save the draft: ${error.message}` : "Draft saved — review it below and approve it before using it.");
    load();
  };

  const approve = async (id: string) => {
    await supabase.from("ai_drafts").update({ status: "Approved" }).eq("id", id);
    load();
  };

  const generate = async () => {
    const subj = subjectName(subjectId);
    const cls = className(classId);
    if (tool === "lesson_notes") {
      if (!topic.trim()) { setMsg("Enter a topic first."); return; }
      await saveDraft("lesson_notes", `Lesson outline: ${topic.trim()} (${cls} — ${subj})`,
        `DRAFT — ${AI_NOTE}\n\nLesson: ${topic.trim()} (${cls}, ${subj})\n\nObjectives:\n- Pupils can explain ${topic.trim()} in their own words.\n- Pupils can answer questions on ${topic.trim()}.\n\nOutline:\n1. Starter — ask what pupils already know about ${topic.trim()}.\n2. Teach — explain in small steps with an example on the board.\n3. Guided practice — work through two examples together.\n4. Independent work — pupils try questions on their own.\n5. Plenary — recap the key point of ${topic.trim()}.`,
        null);
    } else if (tool === "questions") {
      if (!topic.trim()) { setMsg("Enter a topic first."); return; }
      const n = Math.max(1, Math.min(10, Number(count) || 5));
      const lines = Array.from({ length: n }, (_, i) => `${i + 1}. [Replace with your own question ${i + 1} on ${topic.trim()} — e.g. “What is …?” / “Work out …” / “Explain why …”]`).join("\n");
      await saveDraft("questions", `Test questions: ${topic.trim()} (${cls} — ${subj})`,
        `DRAFT — ${AI_NOTE}\n\nTopic: ${topic.trim()} (${cls}, ${subj})\n\n${lines}\n\nMarking: 1 mark each unless you change it. Check every question yourself before giving the test — this draft does not know your syllabus.`,
        null);
    } else if (tool === "report_comment") {
      if (!pupilId || !term) { setMsg("Pick a pupil — and the school needs a current term."); return; }
      const pupil = pupils.find((p) => p.id === pupilId);
      const { data } = await supabase
        .from("score_records")
        .select("test_score, assignment_score, exam_score")
        .eq("student_id", pupilId)
        .eq("subject_id", subjectId)
        .eq("term_id", term.id)
        .maybeSingle();
      const r = data as { test_score: number | null; assignment_score: number | null; exam_score: number | null } | null;
      const total = (r?.test_score ?? 0) + (r?.assignment_score ?? 0) + (r?.exam_score ?? 0);
      const has = !!r && (r.test_score !== null || r.assignment_score !== null || r.exam_score !== null);
      await saveDraft("report_comment",
        `Report comment: ${pupil ? `${pupil.first_name} ${pupil.last_name}` : ""} — ${subj}`,
        `DRAFT — ${AI_NOTE}\n\n${pupil ? `${pupil.first_name} ${pupil.last_name}` : "Pupil"} — ${subj} (${term.session}, ${term.name})\n\n${has ? `Scores on record: Test ${r?.test_score ?? "—"}/20, Assignment ${r?.assignment_score ?? "—"}/10, Exam ${r?.exam_score ?? "—"}/70. Total ${total}/100 (grade ${gradeFor(total)}). ${pupil?.first_name ?? "They"} ${plainGrade(total)} in ${subj} this term.` : `No scores on record for ${subj} this term yet — save scores first, then generate the comment again.`}\n\nTeacher: edit this comment in your own words before it goes on the report card. The scores themselves are never changed by a draft.`,
        pupilId);
    } else {
      // class_summary — from real scores
      if (!term) { setMsg("The school needs a current term first."); return; }
      const ids = pupils.map((p) => p.id);
      const { data } = await supabase
        .from("score_records")
        .select("student_id, test_score, assignment_score, exam_score")
        .eq("class_id", classId)
        .eq("subject_id", subjectId)
        .eq("term_id", term.id);
      const list = (data as { student_id: string; test_score: number | null; assignment_score: number | null; exam_score: number | null }[] | null) ?? [];
      const totals = list.map((r) => (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0));
      const avg = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
      const passes = totals.filter((t) => t >= 40).length;
      await saveDraft("class_summary", `Class summary: ${cls} — ${subj} (${term.name})`,
        `DRAFT — ${AI_NOTE}\n\n${cls} — ${subj}, ${term.session} ${term.name}\n\n${avg === null ? "No scores saved for this class and subject yet." : `${list.length} pupil(s) scored. Class average ${avg.toFixed(1)}/100 (grade ${gradeFor(avg)}). ${passes} of ${list.length} scored 40 or above.`}\n\nNext steps for the teacher to decide: which pupils need extra help, and what to reteach before the next test.`,
        null);
    }
  };

  const toolLabel: Record<string, string> = {
    lesson_notes: "Lesson notes",
    questions: "Test / exam questions",
    report_comment: "Report comment (from real scores)",
    class_summary: "Class summary",
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-1 font-semibold">AI Teacher Assistant</h2>
        <p className="mb-3 text-sm text-slate-500">
          Four drafting tools. Every result is a <strong>draft</strong> — you review and approve it before anyone sees it, and it never changes a grade. {AI_NOTE}
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(toolLabel) as (typeof tool)[]).map((k) => (
            <button key={k} onClick={() => setTool(k)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tool === k ? "bg-royal text-white" : "border border-line bg-white text-slate-600"}`}>
              {toolLabel[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Class</label>
            <select className={inputCls} value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); setPupilId(""); }}>
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Subject</label>
            <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {(tool === "lesson_notes" || tool === "questions") && (
            <div>
              <label className={labelCls}>Topic</label>
              <input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Fractions" />
            </div>
          )}
          {tool === "questions" && (
            <div>
              <label className={labelCls}>How many questions?</label>
              <input className={inputCls} value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value)} />
            </div>
          )}
          {tool === "report_comment" && (
            <div>
              <label className={labelCls}>Pupil</label>
              <select className={inputCls} value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
                {pupils.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </select>
            </div>
          )}
        </div>
        <button className={`${btnCls} mt-3`} onClick={generate}>Draft it</button>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">My AI drafts</h2>
        {drafts.length === 0 ? <p className="text-sm text-slate-500">No drafts yet.</p> : (
          <ul className="space-y-2 text-sm">
            {drafts.map((d) => (
              <li key={d.id} className="rounded-lg bg-mist px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <strong>{d.title}</strong>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{toolLabel[d.kind] ?? d.kind} · {d.status}</span>
                    {d.status === "Draft" && (
                      <button className="rounded-full bg-royal px-2.5 py-1 text-xs font-bold text-white" onClick={() => approve(d.id)}>Approve</button>
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
