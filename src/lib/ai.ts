// Shared client helper for the AI assistants (Teacher Assistant, Parent
// Helper, Study Tutor). All three call the same server route, POST /api/ai,
// so the API key never reaches the browser.
//
// When no key is configured on the server the route answers { demo: true }
// and the caller falls back to the existing template draft, exactly as
// before - clearly labelled demo. When the key is set and the provider
// answers, the caller uses the live text. When the provider fails, the
// caller falls back to the template draft and shows the error.
import { supabase } from "@/lib/supabase";

export type AiKind =
  | "lesson_notes"
  | "questions"
  | "report_comment"
  | "class_summary"
  | "parent_summary"
  | "study_help";

export type AiResult =
  | { demo: true }
  | { demo: false; text: string }
  | { demo: false; text: null; error: string };

export const AI_LIVE_NOTE =
  "Live AI is connected. Every result is still a draft - you review and approve it before anyone sees it, and it never changes a grade.";

export const AI_LIVE_DRAFT_PREFIX = `DRAFT - ${AI_LIVE_NOTE}`;

/** True when the server has an AI key configured. Used only to label the
 *  UI ("Live AI is connected" vs the demo note); the draft itself is
 *  labelled by which path produced it. */
export async function fetchAiLive(): Promise<boolean> {
  try {
    const res = await fetch("/api/ai");
    if (!res.ok) return false;
    const json = (await res.json()) as { configured?: boolean };
    return json.configured === true;
  } catch {
    return false;
  }
}

export async function requestAiDraft(input: {
  kind: AiKind;
  prompt: string;
  context?: string;
}): Promise<AiResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => null)) as {
      demo?: boolean;
      text?: string;
      error?: string;
    } | null;
    if (!res.ok) {
      return {
        demo: false,
        text: null,
        error:
          json?.error ??
          "The AI service is unavailable right now - the demo draft was used instead.",
      };
    }
    if (json?.demo) return { demo: true };
    if (typeof json?.text === "string" && json.text.trim()) {
      return { demo: false, text: json.text.trim() };
    }
    return {
      demo: false,
      text: null,
      error:
        "The AI service returned an empty reply - the demo draft was used instead.",
    };
  } catch {
    return {
      demo: false,
      text: null,
      error:
        "Could not reach the AI service - the demo draft was used instead.",
    };
  }
}
