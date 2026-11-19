import { supabase } from "@/lib/supabase";

/** Per-school headcounts used across Mother Board pages. */
export async function schoolCounts(schoolId: string) {
  const [students, teachers, parents, complaints] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("parents").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("school_id", schoolId).neq("status", "Resolved"),
  ]);
  return {
    students: students.count ?? 0,
    teachers: teachers.count ?? 0,
    parents: parents.count ?? 0,
    openComplaints: complaints.count ?? 0,
  };
}
