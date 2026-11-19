"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PENDING_INVITE_KEY, useAuth } from "@/lib/auth";
import { completeInvite, fetchInvite } from "@/lib/invites";
import type { SchoolInvite } from "@/lib/types";
import { btnCls, Card, inputCls, labelCls, PageHeader } from "@/components/ui";

/** Accept an invite: /invite/<token>
 *  1. Shows who the invite is for (email, role, school) and whether it
 *     is still valid.
 *  2. The invitee sets a password -> Supabase Auth account is created.
 *  3. Their profile (role + school from the invite) is created and the
 *     invite is marked Accepted.
 *  If Supabase asks for email confirmation, the account is created but
 *  there is no session yet: the token is saved and the profile is
 *  finished on first sign-in (see /login). To skip that step, turn off
 *  "Confirm email" in Supabase -> Authentication -> Providers -> Email.
 */
export default function AcceptInvite() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [invite, setInvite] = useState<SchoolInvite | null>(null);
  const [fetchState, setFetchState] = useState("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { invite: inv, error } = await fetchInvite(token);
      if (error || !inv) {
        setFetchState("error");
        setMsg(error ?? "Invite not found.");
        return;
      }
      if (inv.status !== "Pending") {
        setFetchState("error");
        setMsg(`This invite is ${inv.status.toLowerCase()}. Ask for a new one.`);
        return;
      }
      if (new Date(inv.expires_at).getTime() < Date.now()) {
        setFetchState("error");
        setMsg("This invite has expired. Ask for a new one.");
        return;
      }
      setInvite(inv);
      setFetchState("ready");
    })();
  }, [token]);

  // Already signed in with the invited email: finish the invite now.
  useEffect(() => {
    if (authLoading || !user || !invite || done) return;
    if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) return;
    (async () => {
      const res = await completeInvite(token);
      if (res.ok) {
        setDone(true);
        setMsg("Invite accepted — welcome to Digital SchoolVerse.");
      } else {
        setMsg(res.error ?? "Could not finish your invite.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, invite]);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    if (password.length < 8) {
      setMsg("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      setMsg("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setMsg("");
    const { data, error } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/invite/${token}`,
      },
    });
    if (error) {
      setMsg(`Could not create your account: ${error.message}`);
      setBusy(false);
      return;
    }
    if (!data.session) {
      // Email confirmation is on: account created, no session yet.
      // Save the token; /login finishes the invite on first sign-in.
      try {
        localStorage.setItem(PENDING_INVITE_KEY, token);
      } catch {
        /* ignore */
      }
      setMsg(
        "Account created — check your email and confirm it, then sign in. " +
          "Your invite will finish automatically when you sign in.",
      );
      setBusy(false);
      return;
    }
    const res = await completeInvite(token);
    if (!res.ok) {
      setMsg(res.error ?? "Account created, but the invite could not be finished.");
      setBusy(false);
      return;
    }
    setDone(true);
    setMsg("Invite accepted — welcome to Digital SchoolVerse.");
    setBusy(false);
  };

  if (fetchState === "loading") {
    return <p className="text-sm text-slate-500">Checking your invite…</p>;
  }

  if (fetchState === "error" || !invite) {
    return (
      <div>
        <PageHeader title="Invite not valid" sub="This invite link cannot be used." />
        <p className="text-sm text-slate-500">{msg}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <PageHeader title="You are in" sub="Your login is ready." />
        <p className="mb-4 text-sm text-slate-500">{msg}</p>
        <button
          className={btnCls}
          onClick={() =>
            router.replace(
              invite.role === "school_admin" ? "/" : "/",
            )
          }
        >
          Go to your portal →
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Join ${invite.school_name}`}
        sub={`You were invited as ${invite.role.replace("_", " ")} — ${invite.email}. Set a password to create your login.`}
      />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="max-w-md">
        <Card>
          <form onSubmit={accept} className="space-y-3">
            <div>
              <label className={labelCls}>Email (from your invite)</label>
              <input className={inputCls} value={invite.email} disabled />
            </div>
            <div>
              <label className={labelCls}>Choose a password</label>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={labelCls}>Repeat password</label>
              <input
                className={inputCls}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-slate-400">
              Invite expires{" "}
              {new Date(invite.expires_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              .
            </p>
            <button className={btnCls} disabled={busy}>
              Create my login
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
