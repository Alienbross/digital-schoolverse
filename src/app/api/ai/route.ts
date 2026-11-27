// POST /api/ai - the single server-side entry point for the AI assistants
// (AI Teacher Assistant, AI Parent Helper, AI Study Tutor).
//
// The OpenAI-compatible API key lives only here, on the server, in the
// OPENAI_API_KEY env var - it is never sent to the browser. Set
// OPENAI_BASE_URL to point at another OpenAI-compatible provider and
// OPENAI_MODEL to pick the model (default gpt-4o-mini).
//
// Behaviour:
// - No key configured: { demo: true }. The UI then uses its existing
//   template draft, clearly labelled demo, exactly as before.
// - Key configured: the caller's prompt is sent to the provider's chat
//   completions endpoint and the reply text comes back as { demo: false,
//   text }. Only the data the UI already collects is sent - class,
//   subject, topic, and the scores/attendance facts the screen already
//   shows - nothing extra.
// - Provider error: a 502 with a plain message. The UI falls back to the
//   template draft. Provider error bodies are never forwarded.
//
// The caller must be signed in: the route verifies the Supabase access
// token from the Authorization header, so the endpoint cannot be used
// anonymously to spend the key.
//
// GET /api/ai returns { configured: true/false } so the UI can label
// itself "Live AI is connected" or keep the demo note. It reveals
// nothing else.
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

const KINDS = [
  "lesson_notes",
  "questions",
  "report_comment",
  "class_summary",
  "parent_summary",
  "study_help",
] as const;

type AiKind = (typeof KINDS)[number];

const SYSTEM_PROMPTS: Record<AiKind, string> = {
  lesson_notes:
    "You are a teaching assistant for a Nigerian primary and secondary school teacher. Draft a clear lesson outline: 2-3 simple objectives, then a starter, teaching steps with one worked example, guided practice, independent work, and a short plenary recap. Keep it practical for a real classroom. Plain language, no filler.",
  questions:
    "You are a teaching assistant for a Nigerian primary and secondary school teacher. Write the requested number of test questions on the given topic, each on its own numbered line, with a mix of recall, working-out and explain-why questions suited to the class level. Do not include answers or a marking scheme - the teacher adds those.",
  report_comment:
    "You are a teaching assistant for a Nigerian primary and secondary school teacher. Write one short, kind, honest report-card comment (3-5 sentences) about a pupil, based only on the scores given. Mention the strongest area and one concrete next step. Never invent scores, behaviour or facts that were not given. Never change a grade.",
  class_summary:
    "You are a teaching assistant for a Nigerian primary and secondary school teacher. Summarise a class result for the teacher in a few short paragraphs, based only on the figures given: how the class did overall, and what to reteach or which pupils need extra help. Never invent scores or pupil names that were not given.",
  parent_summary:
    "You explain a child's school progress in plain, warm language for a parent who is not a teacher. Use only the scores and attendance figures given. Say what is going well, what needs the most help, and one small practical thing the parent can do at home. Never invent scores or facts that were not given. Short paragraphs, no jargon.",
  study_help:
    "You are a study tutor for a Nigerian primary or secondary school pupil. Guide the pupil step by step to work their question out themself: restate what the question asks, what they already know, then one small step at a time. Never give the final answer directly. End with a quick check they can do themself. Plain, friendly language.",
};

const MAX_PROMPT_CHARS = 4000;
const MAX_CONTEXT_CHARS = 2000;

export async function GET() {
  // Per request: whether a key is set can change without a redeploy of
  // the page, so this must never prerender (see the manifest route).
  await connection();
  return Response.json({ configured: Boolean(process.env.OPENAI_API_KEY) });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const input = body as { kind?: unknown; prompt?: unknown; context?: unknown };
  if (
    typeof input.kind !== "string" ||
    !(KINDS as readonly string[]).includes(input.kind) ||
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > MAX_PROMPT_CHARS ||
    (input.context !== undefined &&
      (typeof input.context !== "string" || input.context.length > MAX_CONTEXT_CHARS))
  ) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const kind = input.kind as AiKind;
  const prompt = input.prompt.trim();
  const context = typeof input.context === "string" ? input.context.trim() : "";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ demo: true });

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

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 1200,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[kind] },
          {
            role: "user",
            content: context ? `${prompt}\n\nFacts to use:\n${context}` : prompt,
          },
        ],
      }),
    });
  } catch {
    return Response.json(
      {
        error:
          "The AI service is unavailable right now - the demo draft was used instead.",
      },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return Response.json(
      {
        error:
          "The AI service is unavailable right now - the demo draft was used instead.",
      },
      { status: 502 },
    );
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    return Response.json(
      {
        error:
          "The AI service returned an empty reply - the demo draft was used instead.",
      },
      { status: 502 },
    );
  }
  return Response.json({ demo: false, text });
}
