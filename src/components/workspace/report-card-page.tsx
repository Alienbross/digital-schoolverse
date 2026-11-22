"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import type { ClassRow, School, Student, Subject, Term } from "@/lib/types";
import { Card, ConfigBanner, PageHeader, btnCls } from "@/components/ui";
import {
  ReportCardBody,
  ReportCardHeader,
  gradeFor,
  type ReportRow,
} from "@/components/report-card";
import { loadDomainRatings, type DomainRatings } from "@/lib/assessments";

/** Collated term report card for one pupil: all subjects' Test /20,
 *  Assignment /10 and Exam /70 scores for the current term, overall
 *  average, class position and attendance - headed by the school's own
 *  logo, name and motto. This is the same card the Scores & Results
 *  page will link to once that port lands. */
export default function StudentReportCard() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const { loading: authLoading, profile } = useAuth();
  const base = useWorkspaceBase();
  // Students and parents reached this card from their own workspace;
  // send them back there, not to the admin Students register.
  const backHref =
    profile?.role === "student"
      ? `${base}/student`
      : profile?.role === "parent"
        ? `${base}/parent`
        : `${base}/students`;
  const [school, setSchool] = useState<School | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [className, setClassName] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [average, setAverage] = useState<number | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [positionOf, setPositionOf] = useState<number | null>(null);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [attendanceText, setAttendanceText] = useState("-");
  const [domains, setDomains] = useState<{ affective: DomainRatings; psychomotor: DomainRatings } | null>(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      const { data: st } = await supabase
        .from("students")
        .select("*")
        .eq("id", studentId)
        .maybeSingle();
      if (!st) {
        setState("not-found");
        return;
      }
      const pupil = st as Student;
      setStudent(pupil);
      const { data: sch } = await supabase
        .from("schools")
        .select("*")
        .eq("id", pupil.school_id)
        .single();
      setSchool((sch as School) ?? null);
      const { data: cls } = await supabase
        .from("classes")
        .select("*")
        .eq("id", pupil.class_id ?? "")
        .maybeSingle();
      setClassName((cls as ClassRow | null)?.name ?? "-");

      const { data: terms } = await supabase
        .from("terms")
        .select("*")
        .eq("school_id", pupil.school_id)
        .eq("is_current", true)
        .limit(1);
      const currentTerm = (terms as Term[] | null)?.[0] ?? null;
      setTerm(currentTerm);

      if (currentTerm) {
        const { data: scores } = await supabase
          .from("score_records")
          .select("*, subjects(name)")
          .eq("student_id", pupil.id)
          .eq("term_id", currentTerm.id);
        const list = (scores ?? []) as unknown as {
          test_score: number | null;
          assignment_score: number | null;
          exam_score: number | null;
          remark: string | null;
          subjects: { name: string } | null;
        }[];
        const built: ReportRow[] = list
          .map((r) => {
            const total =
              (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
            return {
              subject: r.subjects?.name ?? "-",
              test: r.test_score,
              assignment: r.assignment_score,
              exam: r.exam_score,
              total,
              grade: gradeFor(total),
              remark: r.remark,
            };
          })
          .sort((a, b) => a.subject.localeCompare(b.subject));
        setRows(built);
        if (built.length > 0) {
          setAverage(built.reduce((s, r) => s + r.total, 0) / built.length);
        }
        setDomains(await loadDomainRatings(pupil.school_id, pupil.id, currentTerm.id));

        // Class position: average per pupil in the same class this term.
        if (pupil.class_id) {
          const { data: classmates } = await supabase
            .from("students")
            .select("id")
            .eq("class_id", pupil.class_id);
          const ids = ((classmates as { id: string }[] | null) ?? []).map((c) => c.id);
          const { data: allScores } = await supabase
            .from("score_records")
            .select("student_id, test_score, assignment_score, exam_score")
            .eq("term_id", currentTerm.id)
            .in("student_id", ids.length > 0 ? ids : [""]);
          const totals = new Map<string, { sum: number; n: number }>();
          for (const r of (allScores ?? []) as {
            student_id: string;
            test_score: number | null;
            assignment_score: number | null;
            exam_score: number | null;
          }[]) {
            const cur = totals.get(r.student_id) ?? { sum: 0, n: 0 };
            cur.sum += (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
            cur.n += 1;
            totals.set(r.student_id, cur);
          }
          const avgs = [...totals.entries()]
            .map(([id, t]) => ({ id, avg: t.n > 0 ? t.sum / t.n : 0 }))
            .sort((a, b) => b.avg - a.avg);
          const my = avgs.find((a) => a.id === pupil.id);
          if (my) {
            setPosition(avgs.findIndex((a) => a.id === pupil.id) + 1);
            setPositionOf(avgs.length);
          }
        }

        const { data: att } = await supabase
          .from("attendance_records")
          .select("status")
          .eq("student_id", pupil.id)
          .eq("term_id", currentTerm.id);
        const days = (att as { status: string }[] | null) ?? [];
        if (days.length > 0) {
          const present = days.filter((d) => d.status === "Present" || d.status === "Late").length;
          const pct = Math.round((present / days.length) * 100);
          setAttendancePct(pct);
          setAttendanceText(`${present} of ${days.length} days`);
        } else {
          setAttendanceText("No register days yet");
        }
      }
      setState("ready");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, studentId]);

  if (state === "loading") return <p className="text-sm text-slate-500">Loading report card…</p>;
  if (state === "not-found" || !student || !school) {
    return (
      <div>
        <PageHeader title="Report card" sub="Pupil not found." />
        <Link href={backHref} className="font-semibold text-royal">← Back</Link>
      </div>
    );
  }

  const termLabel = term ? `${term.session} - ${term.name}` : "Current term";

  return (
    <div>
      <ConfigBanner />
      <p className="mb-4 text-sm">
        <Link href={backHref} className="font-semibold text-royal">← Back</Link>
      </p>
      <Card>
        <ReportCardHeader school={school} termLabel={termLabel} />
        <ReportCardBody
          studentName={`${student.first_name} ${student.last_name}`}
          admissionNo={student.admission_no}
          className={className}
          rows={rows}
          average={average}
          position={position}
          positionOf={positionOf}
          attendancePct={attendancePct}
          attendanceText={attendanceText}
          affective={domains?.affective ?? null}
          psychomotor={domains?.psychomotor ?? null}
        />
      </Card>
      <button className={btnCls + " mt-4"} onClick={() => window.print()}>
        Print / download report card
      </button>
      <p className="mt-2 text-xs text-slate-500">
        Use your browser&apos;s print dialog to save it as a PDF or print a
        hard copy - one pupil per page.
      </p>
    </div>
  );
}
