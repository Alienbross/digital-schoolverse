// Shared client helper for live email (Resend, free tier).
//
// All real sends go through POST /api/email, the same shape as the AI
// route (/api/ai): the RESEND_API_KEY never reaches the browser, the
// caller must be signed in, and when no key is configured the route
// answers { sent: false, configured: false } so every caller keeps
// its current in-portal-only behaviour exactly as before - no error,
// no visible change.
//
// Kinds are allow-listed server-side, so this route cannot be used
// as an open relay: only the four portal flows below may send.

import { supabase } from "@/lib/supabase";

export type EmailKind = "absence" | "invite" | "sickbay" | "digest";

export type EmailSendResult = {
  sent: boolean;
  /** False when no RESEND_API_KEY is configured on the server. */
  configured: boolean;
  error: string | null;
};

export const EMAIL_NOT_CONFIGURED =
  "No live email provider is connected yet - the notice stays in the portal.";

/** POST /api/email with the signed-in user's access token, mirroring
 *  requestAiDraft() in src/lib/ai.ts. Never throws. */
export async function requestEmailSend(args: {
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(args),
    });
    const json = (await res.json().catch(() => null)) as {
      sent?: boolean;
      configured?: boolean;
      error?: string;
    } | null;
    if (!res.ok) {
      return {
        sent: false,
        configured: json?.configured !== false,
        error:
          json?.error ??
          "The email service is unavailable right now - the notice stays in the portal.",
      };
    }
    return {
      sent: json?.sent === true,
      configured: json?.configured !== false,
      error: json?.error ?? null,
    };
  } catch {
    return {
      sent: false,
      configured: true,
      error:
        "The email service is unavailable right now - the notice stays in the portal.",
    };
  }
}

/** True when the server has a Resend key configured. Used only to
 *  label the UI; the send itself is what decides. */
export async function fetchEmailConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/email");
    if (!res.ok) return false;
    const json = (await res.json()) as { configured?: boolean };
    return json.configured === true;
  } catch {
    return false;
  }
}
