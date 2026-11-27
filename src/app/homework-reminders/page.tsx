"use client";

import { useAuth } from "@/lib/auth";
import HomeworkRemindersSection from "@/components/workspace/homework-reminders";

/** Homework reminders. Also renders under /<school-slug>/homework-reminders. */
export default function HomeworkReminders() {
  const { schoolId } = useAuth();
  return <HomeworkRemindersSection schoolId={schoolId ?? ""} />;
}
