"use client";

import { useAuth } from "@/lib/auth";
import StudentBioSection from "@/components/workspace/student-bio";

/** My bio - the signed-in pupil edits their own bio. Also renders under /<school-slug>/my-bio. */
export default function MyBio() {
  const { schoolId, profile, loading } = useAuth();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!schoolId) return <p className="text-sm text-slate-500">No school selected - sign in to edit your bio.</p>;
  if (!profile?.student_id) {
    return <p className="text-sm text-slate-500">This page is for pupils - sign in with a student account to edit your bio.</p>;
  }
  return <StudentBioSection schoolId={schoolId} studentId={profile.student_id} mode="edit" />;
}
