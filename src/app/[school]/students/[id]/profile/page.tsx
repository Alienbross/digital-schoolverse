"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import StudentProfileContent from "@/components/workspace/student-profile";

/** /<school-slug> workspace page - the same content as the plain
 *  route, guarded to that school. See src/components/school-route. */
export default function StudentProfile() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <StudentProfileContent />
    </SchoolWorkspace>
  );
}
