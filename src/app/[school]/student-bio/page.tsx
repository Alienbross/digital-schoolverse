"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import { useAuth } from "@/lib/auth";
import StudentBioSection from "@/components/workspace/student-bio";

function StudentBioContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("student");
  const { schoolId, loading } = useAuth();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!schoolId) return <p className="text-sm text-slate-500">No school selected - sign in to see a pupil bio.</p>;
  if (!studentId) {
    return (
      <p className="text-sm text-slate-500">
        No pupil picked - open a pupil bio with ?student=&lt;id&gt; in the link.
      </p>
    );
  }
  return <StudentBioSection schoolId={schoolId} studentId={studentId} mode="view" />;
}

/** /<school-slug>/student-bio?student=<id> - read-only bio for a parent or admin. Guarded to that school. */
export default function StudentBio() {
  const params = useParams<{ school: string }>();
  return (
    <SchoolWorkspace slug={params.school}>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <StudentBioContent />
      </Suspense>
    </SchoolWorkspace>
  );
}
