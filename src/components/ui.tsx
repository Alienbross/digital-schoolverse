import type { ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";

export function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>Supabase not connected yet.</strong> Copy{" "}
      <code>.env.example</code> to <code>.env.local</code> and fill in{" "}
      <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> from your Supabase project,
      then run the SQL in <code>supabase/migrations/</code>. Until then this
      page shows an empty register - nothing is saved.
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
}: {
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-royal focus:ring-2 focus:ring-royal/20";

export const btnCls =
  "rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-50";

export const labelCls = "mb-1 block text-xs font-semibold text-slate-600";
