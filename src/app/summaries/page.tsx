"use client";

import { useAuth } from "@/lib/auth";
import PeriodSummariesSection from "@/components/workspace/period-summaries";

/** Assessment reports. Also renders under /<school-slug>/summaries. */
export default function Summaries() {
  const { schoolId, profile } = useAuth();
  return (
    <PeriodSummariesSection
      schoolId={schoolId ?? ""}
      mode={profile?.role === "parent" ? "parent" : "admin"}
    />
  );
}
