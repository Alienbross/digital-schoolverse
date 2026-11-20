"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import AdmissionsContent from "@/components/workspace/admissions";

/** /<school-slug>/admissions - admin review, guarded to that school.
 *  See src/components/school-route. */
export default function SchoolAdmissions() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <AdmissionsContent />
    </SchoolWorkspace>
  );
}
