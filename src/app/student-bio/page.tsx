"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

/** Student bio - read-only bio for a parent or admin, ?student=<id>. Also renders under /<school-slug>/student-bio. */
export default function StudentBio() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <StudentBioContent />
    </Suspense>
  );
}
