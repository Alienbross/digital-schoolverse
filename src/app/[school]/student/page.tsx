"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import StudentContent from "@/components/workspace/student";

/** /<school-slug>/student - guarded to that school. */
export default function Student() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <StudentContent />
    </SchoolWorkspace>
  );
}
