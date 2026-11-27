"use client";

import { useParams } from "next/navigation";
import ClassRegisterForm from "@/components/class-register-form";
import { PageHeader } from "@/components/ui";

/** /<school-slug>/register/class/<class-id> - public per-class
 *  registration link. No sign-in needed to open it. The link only
 *  ever shows that one class (migration 0031). */
export default function SchoolRegisterClass() {
  const params = useParams<{ school: string; classId: string }>();
  if (!params.classId) {
    return (
      <div>
        <PageHeader title="Registration" sub="Pick a class link to register." />
        <p className="text-sm text-slate-500">
          This link is missing the class. Ask the school for a fresh class
          registration link, or register at{" "}
          <a href={`/${params.school}/register`} className="font-semibold text-royal">
            /{params.school}/register
          </a>
          .
        </p>
      </div>
    );
  }
  return <ClassRegisterForm slug={params.school} classId={params.classId} />;
}
