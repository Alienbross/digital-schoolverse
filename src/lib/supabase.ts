import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase client for the browser. Env vars are placeholders until the
// user creates a Supabase project — see .env.example / README.md.
// A dummy URL/key is used at build time so `next build` never crashes
// when the env vars are absent; the UI shows a "Connect Supabase" banner
// instead of real data in that case.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://placeholder.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("YOUR-PROJECT");

export const supabase: SupabaseClient = createClient(url, anonKey);

export type { SupabaseClient };
