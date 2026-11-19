// Shared helpers for the Teacher / Student / Parent workspaces.
// These workspaces run against the real Supabase tables from migration
// 0001 (attendance_records, score_records, homework_assignments,
// timetable_slots, complaints, messages, ai_drafts, cbt_*, fee_*,
// weekly_summaries). No new tables are needed for them; the scoped
// write access they need is granted by migration 0005.

import { supabase } from "@/lib/supabase";
import type { Term } from "@/lib/types";

export const ATTENDANCE_STATUSES = [
  "Present",
  "Late",
  "Absent",
  "Excused",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Today as yyyy-mm-dd (local date, for <input type="date">). */
export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function yearNow(): number {
  return new Date().getFullYear();
}

/** The school's current term, if one is marked current. */
export async function fetchCurrentTerm(
  schoolId: string,
): Promise<Term | null> {
  const { data } = await supabase
    .from("terms")
    .select("*")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .limit(1);
  return ((data as Term[] | null)?.[0] ?? null) as Term | null;
}

/** Attendance % for one pupil in one term: Present + Late count as
 *  attended. Returns null when there are no register days yet. */
export function attendancePct(
  records: { status: string }[],
): { pct: number | null; present: number; total: number } {
  const total = records.length;
  if (total === 0) return { pct: null, present: 0, total: 0 };
  const present = records.filter(
    (r) => r.status === "Present" || r.status === "Late",
  ).length;
  return { pct: Math.round((present / total) * 100), present, total };
}

/** Next complaint reference, e.g. CMP-2026-0007. Counts existing rows
 *  for the school - good enough for a school portal; the reference is
 *  unique per school in the database. */
export async function nextComplaintRef(schoolId: string): Promise<string> {
  const { count } = await supabase
    .from("complaints")
    .select("*", { count: "exact", head: true })
    .eq("school_id", schoolId);
  return `CMP-${yearNow()}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

/** Next online-payment reference, e.g. PAY-2026-0007. */
export async function nextPaymentRef(schoolId: string): Promise<string> {
  const { count } = await supabase
    .from("fee_online_payments")
    .select("*", { count: "exact", head: true })
    .eq("school_id", schoolId);
  return `PAY-${yearNow()}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export type ComplaintCategory =
  | "Bullying"
  | "Fees"
  | "Academics"
  | "Teacher conduct"
  | "Facilities"
  | "Transport"
  | "Health & safety"
  | "Other";

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  "Bullying",
  "Fees",
  "Academics",
  "Teacher conduct",
  "Facilities",
  "Transport",
  "Health & safety",
  "Other",
];

/** Plain-language reading of a total /100, for the AI Parent Helper
 *  and report comments. */
export function plainGrade(total: number): string {
  if (total >= 70) return "doing very well";
  if (total >= 60) return "doing well";
  if (total >= 50) return "doing okay, with room to improve";
  if (total >= 40) return "finding this subject hard right now";
  return "needs extra help in this subject";
}
