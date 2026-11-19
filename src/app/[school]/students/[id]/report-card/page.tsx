"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import StudentReportCardContent from "@/components/workspace/report-card-page";

/** /<school-slug> workspace page - the same content as the plain
 *  route, guarded to that school. See src/components/school-route. */
export default function StudentReportCard() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <StudentReportCardContent />
    </SchoolWorkspace>
  );
}
