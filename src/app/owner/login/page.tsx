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
 *  only then asks Supabase Auth to send a 6-digit code. Step 2: the
 *  owner types the code, it is verified with verifyOtp, and the
 *  Mother Board loads. School users keep the normal password sign-in
 *  on /login - this page is owner-only. */
export default function OwnerLogin() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setBusy(true);
    setMsg("");
    // Owner-only gate: only an email with a platform_owner profile
    // ever gets a code. Any other email gets the same plain message
    // and no code is sent.
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
      setMsg("If this is the owner email, a code has been sent - check your inbox.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false },
    });
    if (error) {
      setMsg(`Could not send a code: ${error.message}`);
      setBusy(false);
      return;
    }
    setStep(2);
    setMsg("Code sent - check your inbox for the 6-digit code.");
    setBusy(false);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    const token = code.trim();
    if (token.length !== 6) {
      setMsg("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.verifyOtp({
      email: clean,
      token,
      type: "email",
    });
    if (error) {
      setMsg(
        "That code did not work - check the 6 digits and try again, or ask for a new code below.",
      );
      setBusy(false);
      return;
    }
    // Session is set; the auth context loads the profile (my_profile
    // fallback included) and the effect above sends the owner onward.
    setBusy(false);
    router.refresh();
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
        sub="No password - enter your email and we send you a 6-digit code."
      />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="max-w-md">
        <Card>
          {step === 1 ? (
            <form onSubmit={sendCode} className="space-y-3">
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
                Send me a code
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-3">
              <div>
                <label className={labelCls}>6-digit code</label>
                <input
                  className={inputCls}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="123456"
                  autoComplete="one-time-code"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Sent to {email.trim().toLowerCase()}. Codes expire after a
                  short while - ask for a new one if yours has expired.
                </p>
              </div>
              <button className={btnCls} disabled={busy || !isSupabaseConfigured}>
                Sign in with code
              </button>
              <div className="flex items-center gap-4 pt-1">
                <button
                  type="button"
                  className="text-sm font-semibold text-royal"
                  onClick={() => sendCode()}
                  disabled={busy}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-royal"
                  onClick={() => {
                    setStep(1);
                    setCode("");
                    setMsg("");
                  }}
                  disabled={busy}
                >
                  Use a different email
                </button>
              </div>
            </form>
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
