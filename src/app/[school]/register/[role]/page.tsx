"use client";

import { useParams } from "next/navigation";
import RegisterForm from "@/components/register-form";
import { PageHeader } from "@/components/ui";
import type { RegisterRole } from "@/lib/types";

const ROLES: RegisterRole[] = ["teacher", "student", "parent"];

/** /<school-slug>/register/<role> - public self-registration for one
 *  role at this school. No invite needed; no sign-in needed. */
export default function SchoolRegisterRole() {
  const params = useParams<{ school: string; role: string }>();
  const role = params.role as RegisterRole;
  if (!ROLES.includes(role)) {
    return (
      <div>
        <PageHeader title="Registration" sub="Pick a role to register." />
        <p className="text-sm text-slate-500">
          Choose teacher, student or parent at{" "}
          <a href={`/${params.school}/register`} className="font-semibold text-royal">
            /{params.school}/register
          </a>
          .
        </p>
      </div>
    );
  }
  return <RegisterForm slug={params.school} role={role} />;
}
