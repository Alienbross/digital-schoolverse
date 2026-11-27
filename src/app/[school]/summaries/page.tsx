"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import { useAuth } from "@/lib/auth";
import PeriodSummariesSection from "@/components/workspace/period-summaries";

/** /<school-slug>/summaries - guarded to that school. Parents see
 *  their shared reports; everyone else sees the admin view. */
export default function Summaries() {
  const params = useParams<{ school: string }>();
  const { schoolId, pathSchool, profile } = useAuth();
  return (
    <SchoolWorkspace slug={params.school}>
      <PeriodSummariesSection
        schoolId={pathSchool?.id ?? schoolId ?? ""}
        mode={profile?.role === "parent" ? "parent" : "admin"}
      />
    </SchoolWorkspace>
  );
}
