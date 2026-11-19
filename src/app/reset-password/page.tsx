"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { btnCls, Card, inputCls, labelCls, PageHeader } from "@/components/ui";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setMsg("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setMsg("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMsg(`Could not set the new password: ${error.message}`);
      setBusy(false);
      return;
    }
    setMsg("Password set. Signing you in…");
    setBusy(false);
    router.replace("/");
  };

  return (
    <div>
      <PageHeader title="Set a new password" sub="You got here from a password-reset email. Choose a new password for your account." />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="max-w-md">
        <Card>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className={labelCls}>New password</label>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={labelCls}>Repeat new password</label>
              <input
                className={inputCls}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button className={btnCls} disabled={busy}>
              Set new password
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
