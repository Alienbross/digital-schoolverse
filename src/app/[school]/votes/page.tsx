"use client";

import { useParams } from "next/navigation";
import { SchoolWorkspace } from "@/components/school-route";
import { useAuth } from "@/lib/auth";
import VotingSection from "@/components/workspace/voting";

/** /<school-slug>/votes - guarded to that school. The school admin
 *  and the platform owner manage votes; everybody else votes. */
export default function Votes() {
  const params = useParams<{ school: string }>();
  const { profile, schoolId, loading } = useAuth();
  const isAdmin =
    profile?.role === "school_admin" || profile?.role === "platform_owner";
  if (loading || !schoolId) {
    return (
      <SchoolWorkspace slug={params.school}>
        <main className="mx-auto w-full max-w-5xl px-4 py-12">
          <p className="text-sm text-slate-500">Loading…</p>
        </main>
      </SchoolWorkspace>
    );
  }
  return (
    <SchoolWorkspace slug={params.school}>
      <VotingSection schoolId={schoolId} mode={isAdmin ? "admin" : "vote"} />
    </SchoolWorkspace>
  );
}
