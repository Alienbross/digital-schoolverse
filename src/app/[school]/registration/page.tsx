"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import RegistrationContent from "@/components/workspace/registration";

/** /<school-slug>/registration - admin approvals, guarded to that school. */
export default function SchoolRegistration() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <RegistrationContent />
    </SchoolWorkspace>
  );
}
