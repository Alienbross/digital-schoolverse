// Affective & psychomotor assessments (migration 0012) - the two
// non-cognitive domains of the Daily School Runs. Cognitive scores
// (Test /20, Assignment /10, Exam /70) already live in score_records;
// this file only covers the other two domains, and links to the
// cognitive scores read-only - it never writes a score.
import { supabase } from "@/lib/supabase";
import type { Term } from "@/lib/types";

export type Domain = "affective" | "psychomotor";

export const DOMAIN_LABELS: Record<Domain, string> = {
  affective: "Affective domain",
  psychomotor: "Psychomotor domain",
};

// Default traits a school starts with. The admin can add, rename or
// remove them in School Setup; these are only the seed list.
export const DEFAULT_AFFECTIVE = [
  "Punctuality",
  "Neatness",
  "Honesty",
  "Obedience",
  "Attentiveness",
  "Cooperation",
  "Leadership",
];

export const DEFAULT_PSYCHOMOTOR = [
  "Handwriting",
  "Drawing",
  "Craftwork",
  "Sports and Games",
  "ICT and Computer Use",
  "Practical Skills",
];

// 1-5 rating scale, same wording on entry, report card and profile.
export const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

export function ratingLabel(rating: number | null): string {
  if (rating === null || rating === undefined) return "-";
  return `${rating} - ${RATING_LABELS[rating] ?? ""}`;
}

export type AssessmentTrait = {
  id: string;
  school_id: string;
  domain: Domain;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type DomainRating = {
  traitId: string;
  traitName: string;
  rating: number;
};

export type DomainRatings = {
  domain: Domain;
  items: DomainRating[];
  comment: string | null;
  average: number | null; // mean of the rated traits, null when none rated
};

function averageOf(items: DomainRating[]): number | null {
  if (items.length === 0) return null;
  return items.reduce((s, x) => s + x.rating, 0) / items.length;
}

/** Seed the default traits for a school if it has none yet, then
 *  return the school's active traits in order. */
export async function loadTraits(schoolId: string): Promise<AssessmentTrait[]> {
  if (!schoolId) return [];
  await supabase.rpc("ensure_default_assessment_traits", { p_school_id: schoolId });
  const { data } = await supabase
    .from("assessment_traits")
    .select("*")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("domain", { ascending: true })
    .order("sort_order", { ascending: true });
  return ((data as AssessmentTrait[] | null) ?? []).sort((a, b) =>
    a.domain === b.domain
      ? a.sort_order - b.sort_order
      : a.domain === "affective"
        ? -1
        : 1,
  );
}

/** All saved ratings + comments for one pupil in one term, both
 *  domains. Trait names come from the saved rating rows, so a trait
 *  renamed or removed later does not rewrite past report cards. */
export async function loadDomainRatings(
  schoolId: string,
  studentId: string,
  termId: string | null,
): Promise<{ affective: DomainRatings; psychomotor: DomainRatings }> {
  const empty = (domain: Domain): DomainRatings => ({
    domain,
    items: [],
    comment: null,
    average: null,
  });
  if (!schoolId || !studentId || !termId) {
    return { affective: empty("affective"), psychomotor: empty("psychomotor") };
  }
  const [{ data: ratings }, { data: comments }] = await Promise.all([
    supabase
      .from("domain_assessments")
      .select("trait_id, domain, trait_name, rating")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("term_id", termId),
    supabase
      .from("domain_assessment_comments")
      .select("domain, comment")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("term_id", termId),
  ]);
  const build = (domain: Domain): DomainRatings => {
    const items = ((ratings as { trait_id: string; domain: string; trait_name: string; rating: number }[] | null) ?? [])
      .filter((r) => r.domain === domain)
      .map((r) => ({ traitId: r.trait_id, traitName: r.trait_name, rating: r.rating }))
      .sort((a, b) => a.traitName.localeCompare(b.traitName));
    const comment =
      ((comments as { domain: string; comment: string }[] | null) ?? []).find(
        (c) => c.domain === domain,
      )?.comment ?? null;
    return { domain, items, comment: comment || null, average: averageOf(items) };
  };
  return { affective: build("affective"), psychomotor: build("psychomotor") };
}

/** Per-pupil domain averages for a whole class this term, for the
 *  Students register summary line. Keyed by student id. */
export async function loadClassDomainAverages(
  schoolId: string,
  termId: string | null,
): Promise<Record<string, { affective: number | null; psychomotor: number | null }>> {
  if (!schoolId || !termId) return {};
  const { data } = await supabase
    .from("domain_assessments")
    .select("student_id, domain, rating")
    .eq("school_id", schoolId)
    .eq("term_id", termId);
  const byStudent: Record<string, { affective: number[]; psychomotor: number[] }> = {};
  for (const r of (data as { student_id: string; domain: string; rating: number }[] | null) ?? []) {
    const cur = (byStudent[r.student_id] ??= { affective: [], psychomotor: [] });
    if (r.domain === "affective") cur.affective.push(r.rating);
    else cur.psychomotor.push(r.rating);
  }
  const out: Record<string, { affective: number | null; psychomotor: number | null }> = {};
  for (const [id, v] of Object.entries(byStudent)) {
    out[id] = {
      affective: v.affective.length > 0 ? v.affective.reduce((s, x) => s + x, 0) / v.affective.length : null,
      psychomotor: v.psychomotor.length > 0 ? v.psychomotor.reduce((s, x) => s + x, 0) / v.psychomotor.length : null,
    };
  }
  return out;
}

export type { Term };
