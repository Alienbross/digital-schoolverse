"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import { useAuth } from "@/lib/auth";
import TeacherProfilesSection from "@/components/workspace/teacher-profiles";

function TeacherProfilesContent() {
  const { schoolId, profile, loading } = useAuth();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!schoolId) return <p className="text-sm text-slate-500">No school selected - sign in to see teacher profiles.</p>;
  // Parents and pupils read; teachers and admins edit bios.
  const mode = profile?.role === "parent" || profile?.role === "student" ? "view" : "edit";
  return <TeacherProfilesSection schoolId={schoolId} mode={mode} />;
}

/** /<school-slug>/teacher-profiles - guarded to that school. */
export default function TeacherProfiles() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <TeacherProfilesContent />
    </SchoolWorkspace>
  );
}
