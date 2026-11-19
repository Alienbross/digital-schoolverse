"use client";

import { SchoolLogo } from "@/components/school-logo";
import type { School } from "@/lib/types";

/** Nigerian grades used across the portal: A 70+, B 60–69, C 50–59,
 *  D 45–49, E 40–44, F below 40. */
export function gradeFor(total: number): string {
  if (total >= 70) return "A";
  if (total >= 60) return "B";
  if (total >= 50) return "C";
  if (total >= 45) return "D";
  if (total >= 40) return "E";
  return "F";
}

export type ReportRow = {
  subject: string;
  test: number | null;
  assignment: number | null;
  exam: number | null;
  total: number;
  grade: string;
  remark: string | null;
};

/** The top of a student report card: the school's own logo (or its
 *  initials when no logo is set), school name and motto. The logo sits
 *  on a white disc so it renders on light and dark themes. */
export function ReportCardHeader({
  school,
  termLabel,
}: {
  school: Pick<School, "name" | "motto" | "logo_url">;
  termLabel: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-4 border-b-2 border-royal pb-4">
      <SchoolLogo name={school.name} logoUrl={school.logo_url} size={72} />
      <div>
        <h1 className="text-2xl font-bold text-ink">{school.name}</h1>
        {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
        <p className="mt-1 text-sm font-semibold text-royal">
          Term Report Card - {termLabel}
        </p>
      </div>
    </div>
  );
}

/** Collated term report card body: per-subject Test /20, Assignment
 *  /10, Exam /70, total and grade, plus overall average, class
 *  position and attendance. */
export function ReportCardBody({
  studentName,
  admissionNo,
  className,
  rows,
  average,
  position,
  positionOf,
  attendancePct,
  attendanceText,
}: {
  studentName: string;
  admissionNo: string;
  className: string;
  rows: ReportRow[];
  average: number | null;
  position: number | null;
  positionOf: number | null;
  attendancePct: number | null;
  attendanceText: string;
}) {
  return (
    <div>
      <div className="mb-4 grid gap-1 text-sm sm:grid-cols-2">
        <p><strong>Pupil:</strong> {studentName}</p>
        <p><strong>Admission No:</strong> {admissionNo}</p>
        <p><strong>Class:</strong> {className}</p>
        <p><strong>Attendance:</strong> {attendanceText}{attendancePct !== null ? ` (${attendancePct}%)` : ""}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No scores saved for this pupil this term yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-mist text-left">
              <th className="border border-line px-2 py-2">Subject</th>
              <th className="border border-line px-2 py-2">Test /20</th>
              <th className="border border-line px-2 py-2">Assign. /10</th>
              <th className="border border-line px-2 py-2">Exam /70</th>
              <th className="border border-line px-2 py-2">Total /100</th>
              <th className="border border-line px-2 py-2">Grade</th>
              <th className="border border-line px-2 py-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.subject}>
                <td className="border border-line px-2 py-2 font-medium">{r.subject}</td>
                <td className="border border-line px-2 py-2">{r.test ?? "-"}</td>
                <td className="border border-line px-2 py-2">{r.assignment ?? "-"}</td>
                <td className="border border-line px-2 py-2">{r.exam ?? "-"}</td>
                <td className="border border-line px-2 py-2 font-semibold">{r.total}</td>
                <td className="border border-line px-2 py-2 font-semibold">{r.grade}</td>
                <td className="border border-line px-2 py-2">{r.remark ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <p className="rounded-lg bg-mist px-3 py-2">
          <strong>Overall average:</strong>{" "}
          {average !== null ? `${average.toFixed(1)} (${gradeFor(average)})` : "-"}
        </p>
        <p className="rounded-lg bg-mist px-3 py-2">
          <strong>Class position:</strong>{" "}
          {position !== null && positionOf !== null
            ? `${position} of ${positionOf}`
            : "-"}
        </p>
        <p className="rounded-lg bg-mist px-3 py-2">
          <strong>Attendance:</strong> {attendanceText}
        </p>
      </div>
    </div>
  );
}
