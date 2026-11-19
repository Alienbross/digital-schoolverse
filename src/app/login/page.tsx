"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { PENDING_INVITE_KEY, useAuth } from "@/lib/auth";
import { completeInvite } from "@/lib/invites";
import { fetchSchoolBranding, type SchoolBranding } from "@/lib/logo";
import { fetchSchoolBySlug } from "@/lib/slug";
import { SchoolLogo } from "@/components/school-logo";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";

/** Sign in. On a school path (/<slug>/login) the school's logo shows
 *  and sign-in lands in that school's workspace. */
export default function Login({ schoolSlug }: { schoolSlug?: string }) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [resetSent, setResetSent] = useState(false);
  // Branding of the school that invited this person (if they arrived
  // via an invite): the school's logo shows on the sign-in page.
  const [branding, setBranding] = useState<SchoolBranding | null>(null);

  useEffect(() => {
    (async () => {
      // A school path brands the sign-in page with that school.
      if (schoolSlug) {
        const bySlug = await fetchSchoolBySlug(schoolSlug);
        if (bySlug) {
          setBranding({ name: bySlug.name, motto: bySlug.motto, logo_url: bySlug.logo_url });
          return;
        }
      }
      try {
        const token = localStorage.getItem(PENDING_INVITE_KEY);
        if (!token) return;
        const { data: inv } = await supabase
          .from("invites")
          .select("school_id")
          .eq("token", token)
          .eq("status", "Pending")
          .maybeSingle();
        const schoolId = (inv as { school_id: string } | null)?.school_id;
        if (schoolId) setBranding(await fetchSchoolBranding(schoolId));
      } catch {
        /* ignore — platform branding is the fallback */
      }
    })();
  }, [schoolSlug]);

  // Already signed in: finish any pending invite, then send them onward.
  // Each role lands in its own workspace: the platform owner on the
  // Mother Board, the school admin on the school overview, and
  // teachers / students / parents in their own workspaces
  // (/<slug>/teacher, /<slug>/student, /<slug>/parent).
  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      try {
        const token = localStorage.getItem(PENDING_INVITE_KEY);
        if (token) {
          const res = await completeInvite(token);
          if (!res.ok) setMsg(res.error ?? "Could not finish your invite.");
        }
      } catch {
        /* ignore */
      }
      // Read the profile fresh — a brand-new invite user has no profile
      // in context yet (completeInvite just created it).
      const { data: prof } = await supabase
        .from("profiles")
        .select("role, school_id")
        .eq("id", user.id)
        .maybeSingle();
      const role = (prof as { role: string } | null)?.role ?? profile?.role;
      const schoolId =
        (prof as { school_id: string | null } | null)?.school_id ??
        profile?.school_id ??
        null;
      let slug = schoolSlug ?? null;
      if (!slug && schoolId) {
        const { data } = await supabase
          .from("schools")
          .select("slug")
          .eq("id", schoolId)
          .maybeSingle();
        slug = (data as { slug: string } | null)?.slug ?? null;
      }
      const base = slug ? `/${slug}` : "";
      let dest = `${base}/` || "/";
      if (role === "platform_owner") dest = "/mother-board";
      else if (role === "teacher") dest = `${base}/teacher`;
      else if (role === "student") dest = `${base}/student`;
      else if (role === "parent") dest = `${base}/parent`;
      router.replace(dest);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setMsg(`Could not sign in: ${error.message}`);
      setBusy(false);
      return;
    }
    // Finish a pending invite (accept flow that waited on email confirmation).
    try {
      const token = localStorage.getItem(PENDING_INVITE_KEY);
      if (token) {
        const res = await completeInvite(token);
        if (!res.ok) setMsg(res.error ?? "Could not finish your invite.");
      }
    } catch {
      /* ignore */
    }
    setBusy(false);
    router.refresh();
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      setMsg("Enter your email above first, then tap “Forgot password?”.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setMsg(
      error
        ? `Could not send reset email: ${error.message}`
        : "Reset email sent — check your inbox.",
    );
    if (!error) setResetSent(true);
    setBusy(false);
  };

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Sign in" sub="Digital SchoolVerse — school staff, teachers, parents and students sign in here. The platform owner signs in here too." />
      {branding && (
        <div className="mb-4 flex items-center gap-3">
          <SchoolLogo name={branding.name} logoUrl={branding.logo_url} size={56} />
          <div>
            <p className="font-bold text-ink">{branding.name}</p>
            {branding.motto && <p className="text-sm italic text-slate-500">{branding.motto}</p>}
          </div>
        </div>
      )}
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="max-w-md">
        <Card>
          <form onSubmit={signIn} className="space-y-3">
            <div>
              <label className={labelCls}>Email</label>
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
              />
            </div>
            <button className={btnCls} disabled={busy || !isSupabaseConfigured}>
              Sign in
            </button>
          </form>
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-royal"
            onClick={forgotPassword}
            disabled={busy}
          >
            Forgot password?
          </button>
          {resetSent && (
            <p className="mt-2 text-xs text-slate-500">
              The reset link goes to /reset-password on this site.
            </p>
          )}
        </Card>
        <p className="mt-4 text-sm text-slate-500">
          No account yet? You need an invite: the platform owner (Mother
          Board) or your school admin generates one and shares the link with
          you. Open that link, set your password, and you are in.
        </p>
      </div>
    </div>
  );
}
