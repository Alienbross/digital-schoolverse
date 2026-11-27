"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";

/** Platform-owner sign-in - no password at all. Step 1: email only.
 *  The app first checks (via the is_platform_owner_email RPC from
 *  migration 0030) that the email belongs to a platform owner, and
 *  only then asks Supabase Auth to send a sign-in link. Step 2: the
 *  owner taps the link in the email. The link lands back on this
 *  page, the Supabase client picks the session up from the URL, and
 *  the Mother Board loads. No code anywhere - the Free-plan email
 *  template only carries a link, so the page works with the link
 *  that already arrives. School users keep the normal password
 *  sign-in on /login - this page is owner-only. */
export default function OwnerLogin() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [noProfile, setNoProfile] = useState(false);

  // Already signed in: the owner goes straight to the Mother Board.
  // A signed-in account with no profile (or a non-owner role) is told
  // so here instead of being bounced to the school sign-in.
  useEffect(() => {
    if (loading || !user) return;
    if (!profile) {
      setNoProfile(true);
      return;
    }
    if (profile.role === "platform_owner") router.replace("/mother-board");
    else setNoProfile(true);
  }, [loading, user, profile, router]);

  const sendLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setBusy(true);
    setMsg("");
    // Owner-only gate: only an email with a platform_owner profile
    // ever gets a link. Any other email gets the same plain message
    // and no email is sent.
    const { data: isOwner, error: rpcError } = await supabase.rpc(
      "is_platform_owner_email",
      { p_email: clean },
    );
    if (rpcError) {
      setMsg(`Could not check that email: ${rpcError.message}`);
      setBusy(false);
      return;
    }
    if (!isOwner) {
      setMsg("If this is the owner email, a sign-in link has been sent - check your inbox.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        shouldCreateUser: false,
        // The link comes back here, not to the site root: this page is
        // public, so the shell never bounces the owner to /login while
        // the session is being picked up from the link.
        emailRedirectTo: `${window.location.origin}/owner/login`,
      },
    });
    if (error) {
      setMsg(`Could not send a link: ${error.message}`);
      setBusy(false);
      return;
    }
    setStep(2);
    setMsg("Link sent - check your inbox and tap the sign-in link.");
    setBusy(false);
  };

  if (noProfile) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Account not set up yet" sub="This sign-in is for the platform owner only." />
        <p className="max-w-md text-sm text-slate-500">
          You are signed in as {user?.email}, but this account has no
          platform-owner profile. If this is the owner email, ask for a new
          invite - or sign out and try again with the owner email.
        </p>
        <button
          className="mt-4 rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Platform owner sign-in"
        sub="No password - enter your email and we send you a sign-in link."
      />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="max-w-md">
        <Card>
          {step === 1 ? (
            <form onSubmit={sendLink} className="space-y-3">
              <div>
                <label className={labelCls}>Email</label>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  autoComplete="email"
                />
              </div>
              <button className={btnCls} disabled={busy || !isSupabaseConfigured}>
                Send me a sign-in link
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Check your inbox at {email.trim().toLowerCase()} and tap the
                sign-in link. It opens this page signed in, and takes you
                straight to the Mother Board.
              </p>
              <p className="text-xs text-slate-500">
                Links expire after a short while - ask for a new one if yours
                has expired.
              </p>
              <div className="flex items-center gap-4 pt-1">
                <button
                  type="button"
                  className="text-sm font-semibold text-royal"
                  onClick={() => sendLink()}
                  disabled={busy}
                >
                  Resend link
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-royal"
                  onClick={() => {
                    setStep(1);
                    setMsg("");
                  }}
                  disabled={busy}
                >
                  Use a different email
                </button>
              </div>
            </div>
          )}
        </Card>
        <p className="mt-4 text-sm text-slate-500">
          School staff, teachers, parents and students sign in with a
          password instead:{" "}
          <Link href="/login" className="font-semibold text-royal">
            Go to school sign-in →
          </Link>
        </p>
      </div>
    </div>
  );
}
