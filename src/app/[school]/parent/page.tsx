"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import ParentContent from "@/components/workspace/parent";

/** /<school-slug>/parent - guarded to that school. */
export default function Parent() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <ParentContent />
    </SchoolWorkspace>
  );
}
