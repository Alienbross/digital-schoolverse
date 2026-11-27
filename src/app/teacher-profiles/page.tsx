"use client";

import { useAuth } from "@/lib/auth";
import TeacherProfilesSection from "@/components/workspace/teacher-profiles";

/** Teacher profiles. Also renders under /<school-slug>/teacher-profiles. */
export default function TeacherProfiles() {
  const { schoolId, profile, loading } = useAuth();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!schoolId) return <p className="text-sm text-slate-500">No school selected - sign in to see teacher profiles.</p>;
  // Parents and pupils read; teachers and admins edit bios.
  const mode = profile?.role === "parent" || profile?.role === "student" ? "view" : "edit";
  return <TeacherProfilesSection schoolId={schoolId} mode={mode} />;
}
