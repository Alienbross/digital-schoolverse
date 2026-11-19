"use client";

import { useParams } from "next/navigation";
import RegisterChooser from "@/components/register-chooser";

/** /<school-slug>/register — public chooser: pick a role and register
 *  at this school. No invite needed; no sign-in needed. */
export default function SchoolRegister() {
  const params = useParams<{ school: string }>();
  return <RegisterChooser slug={params.school} />;
}
