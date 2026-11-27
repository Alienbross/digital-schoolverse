"use client";

import { useAuth } from "@/lib/auth";
import VotingSection from "@/components/workspace/voting";

/** Voting. Also renders under /<school-slug>/votes. The school admin
 *  and the platform owner manage votes; everybody else votes. */
export default function Votes() {
  const { profile, schoolId, loading } = useAuth();
  const isAdmin =
    profile?.role === "school_admin" || profile?.role === "platform_owner";
  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }
  if (!schoolId) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-bold text-ink">Voting</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to see your school&apos;s votes.
        </p>
      </main>
    );
  }
  return <VotingSection schoolId={schoolId} mode={isAdmin ? "admin" : "vote"} />;
}
