"use client";

import type { Profile } from "@/lib/types";

/** Banner shown to a teacher / student / parent whose account is
 *  still waiting for approval (or was rejected). Pending accounts
 *  can complete their profile/setup only — the rest of the workspace
 *  stays locked until the school approves them. */
export function PendingBanner({ profile }: { profile: Profile }) {
  if (profile.status === "Active") return null;
  if (profile.status === "Rejected") {
    return (
      <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        <strong>Your registration was not approved.</strong>{" "}
        {profile.status_reason
          ? `Reason: ${profile.status_reason}. `
          : ""}
        Contact the school admin if you think this is a mistake.
      </div>
    );
  }
  if (profile.status !== "Pending") return null;
  const role = profile.role.replace("_", " ");
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>Your {role} account is waiting for approval.</strong> You can
      complete your profile and setup below, but notices, messages, fee
      payments, complaints, registers, scores and CBT stay locked until
      the school approves your account.
    </div>
  );
}

/** Shown in place of a locked workspace tab while approval is pending. */
export function LockedNotice({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <h2 className="font-semibold">{what} is locked for now</h2>
      <p className="mt-1 text-sm text-slate-500">
        Your account is still waiting for approval. Once the school
        approves it, {what.toLowerCase()} opens here. Meanwhile you can
        finish your profile and setup.
      </p>
    </div>
  );
}
