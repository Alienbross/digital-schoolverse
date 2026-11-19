"use client";

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import { Card, ConfigBanner, PageHeader } from "@/components/ui";
import ApprovalsList from "@/components/workspace/approvals";

/** Registration & Approvals (admin / platform owner): the pending
 *  accounts waiting for a decision, and the proposed pupil links.
 *  Phase switches live in School Setup. */
export default function Registration() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const canManage = useCanManage();
  const base = useWorkspaceBase();

  if (!canManage && profile) {
    return (
      <div>
        <PageHeader title="Registration & Approvals" sub="Approvals are handled by the school admin." />
        <p className="text-sm text-slate-500">
          Signed in as {profile.role.replace("_", " ")} - only the school
          admin (or the platform owner) sees this page.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Registration & Approvals"
        sub="Accounts that registered from the school's own link, waiting for approval - plus pupil links to check."
      />
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">How registration works here</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Teachers register first, then students, then parents - the admin opens each phase in School Setup.</li>
            <li>Teachers are approved by the school admin only.</li>
            <li>Students are approved by their class teacher or the school admin.</li>
            <li>Parents are approved by the school admin or senior staff (granted in Teachers &amp; Staff).</li>
            <li>Approving a parent also approves the pupil links they proposed.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Registration phases</h2>
          <p className="mt-2 text-sm text-slate-600">
            Open or close each phase in School Setup - teachers first, then
            students, then parents. A closed phase shows “not open yet” on
            its register page.
          </p>
          <Link href={`${base}/setup`} className="mt-3 inline-block text-sm font-semibold text-royal">
            Go to School Setup →
          </Link>
          <p className="mt-3 text-sm text-slate-600">
            Public register pages:{" "}
            <span className="font-semibold text-ink">
              {base || "(school path)"}/register
            </span>{" "}
            - share that link with teachers, students and parents.
          </p>
        </Card>
      </div>
      {isSupabaseConfigured && !authLoading && schoolId ? (
        <ApprovalsList schoolId={schoolId} scope="admin" />
      ) : (
        <Card>
          <p className="text-sm text-slate-500">
            {authLoading ? "Loading…" : "Pick a school to see its pending registrations."}
          </p>
        </Card>
      )}
    </div>
  );
}
