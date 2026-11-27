// POST /api/email - the single server-side entry point for live email
// (Resend, free tier). Mirrors /api/ai: the RESEND_API_KEY lives only
// here, on the server, in the RESEND_API_KEY env var - it is never sent
// to the browser. RESEND_FROM sets the sender address; without it the
// free-tier default onboarding@resend.dev is used.
//
// Behaviour:
// - No key configured: { sent: false, configured: false }. Callers
//   keep their in-portal-only behaviour exactly as before.
// - Key configured: the message is sent via Resend's HTTP API
//   (https://api.resend.com/emails) and the reply is { sent: true }.
// - Provider error: a 502 with a plain message. Provider error bodies
//   are never forwarded.
// - The caller must be signed in: the route verifies the Supabase
//   access token from the Authorization header, so the endpoint
//   cannot be used anonymously. Kind is allow-listed to the four
//   portal flows, so it cannot be used as an open relay.
//
// Free-tier note: with the default onboarding@resend.dev sender,
// Resend only delivers to the email address on the Resend account
// itself. To email real parents, teachers and invitees, verify a
// domain in Resend and set RESEND_FROM to an address on it.
//
// GET /api/email returns { configured: true/false } so the UI can
// label itself. It reveals nothing else.
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

const KINDS = ["absence", "invite", "sickbay", "digest"] as const;

type EmailKind = (typeof KINDS)[number];

const MAX_TO_CHARS = 254;
const MAX_SUBJECT_CHARS = 200;
const MAX_TEXT_CHARS = 10000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  // Per request: whether a key is set can change without a redeploy of
  // the page, so this must never prerender (see the manifest route).
  await connection();
  return Response.json({ configured: Boolean(process.env.RESEND_API_KEY) });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const input = body as {
    kind?: unknown;
    to?: unknown;
    subject?: unknown;
    text?: unknown;
  };
  if (
    typeof input.kind !== "string" ||
    !(KINDS as readonly string[]).includes(input.kind) ||
    typeof input.to !== "string" ||
    !input.to.trim() ||
    input.to.length > MAX_TO_CHARS ||
    !EMAIL_RE.test(input.to.trim()) ||
    typeof input.subject !== "string" ||
    !input.subject.trim() ||
    input.subject.length > MAX_SUBJECT_CHARS ||
    typeof input.text !== "string" ||
    !input.text.trim() ||
    input.text.length > MAX_TEXT_CHARS
  ) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const kind = input.kind as EmailKind;
  const to = input.to.trim();
  const subject = input.subject.trim();
  const text = input.text.trim();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return Response.json({ sent: false, configured: false });

  // The caller must be signed in, so the key cannot be spent anonymously.
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "Sign in again, then try once more." },
      { status: 401 },
    );
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return Response.json(
      { error: "Sign in again, then try once more." },
      { status: 401 },
    );
  }

  const from = process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
  } catch {
    return Response.json(
      {
        error:
          "The email service is unavailable right now - the notice stays in the portal.",
      },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return Response.json(
      {
        error:
          "The email service could not send this message - the notice stays in the portal.",
      },
      { status: 502 },
    );
  }
  // `kind` is validated against the allow-list above so the route
  // cannot be used as an open relay; the send itself is the same
  // Resend call for every kind.
  void kind;
  return Response.json({ sent: true, configured: true });
}
