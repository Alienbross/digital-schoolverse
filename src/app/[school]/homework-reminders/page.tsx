"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import { useAuth } from "@/lib/auth";
import HomeworkRemindersSection from "@/components/workspace/homework-reminders";

/** /<school-slug>/homework-reminders - guarded to that school. */
export default function HomeworkReminders() {
  const params = useParams<{ school: string }>();
  const { schoolId, pathSchool } = useAuth();
  return (
    <SchoolWorkspace slug={params.school}>
      <HomeworkRemindersSection schoolId={pathSchool?.id ?? schoolId ?? ""} />
    </SchoolWorkspace>
  );
}
