"use client";

import { useParams } from "next/navigation";
import AdmissionsApply from "@/components/admissions-apply";

/** /<school-slug>/admissions/apply - public apply form. No sign-in
 *  needed; the school is the slug in the URL. */
export default function SchoolAdmissionsApply() {
  const params = useParams<{ school: string }>();
  return <AdmissionsApply slug={params.school} />;
}
