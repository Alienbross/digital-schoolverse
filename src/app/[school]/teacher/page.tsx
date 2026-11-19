"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import TeacherContent from "@/components/workspace/teacher";

/** /<school-slug>/teacher - guarded to that school. */
export default function Teacher() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <TeacherContent />
    </SchoolWorkspace>
  );
}
