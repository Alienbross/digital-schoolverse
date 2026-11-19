"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/** Renders children only for a signed-in platform owner. Anyone else
 *  sees a plain access message (or is sent to /login when signed out).
 *  Real enforcement is the database RLS in migration 0002 - this is
 *  only the UI gate. */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  const router = useRouter();

  if (loading) return <p className="text-sm text-slate-500">Checking access…</p>;
  if (!user) {
    router.replace("/login");
    return <p className="text-sm text-slate-500">Sign in to continue…</p>;
  }
  if (!profile) {
    return (
      <p className="text-sm text-slate-500">
        Your account is signed in but has no profile yet. Ask the platform
        owner to send you an invite, or to finish your account setup.
      </p>
    );
  }
  if (profile.role !== "platform_owner") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Mother Board - platform owner only</h1>
        <p className="mt-2 text-sm text-slate-500">
          You are signed in as {profile.role.replace("_", " ")}. Only the
          platform owner can open the Mother Board. Your school workspace is
          in the sidebar.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
