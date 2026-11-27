"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import { useAuth } from "@/lib/auth";
import SickbaySection from "@/components/workspace/sickbay";

/** /<school-slug>/sickbay - guarded to that school. */
export default function Sickbay() {
  const params = useParams<{ school: string }>();
  const { schoolId, pathSchool } = useAuth();
  return (
    <SchoolWorkspace slug={params.school}>
      <SickbaySection schoolId={pathSchool?.id ?? schoolId ?? ""} />
    </SchoolWorkspace>
  );
}
