"use client";

import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Per-school path URLs: each school gets a short name (slug) and its
 *  own path address, e.g. digital-schoolverse.vercel.app/greenfield.
 *  No domain to buy — the Mother Board sets the slug when the school
 *  is created. The slug only picks which school's portal the URL
 *  points at; school scoping and RLS (migration 0002) still decide
 *  what a signed-in user may actually see.
 */

/** Route words a school slug must never be, or it would clash with a
 *  real route. The database enforces the same list (migration 0004). */
export const RESERVED_SLUGS = new Set([
  "login",
  "invite",
  "reset-password",
  "mother-board",
  "api",
  "_next",
  "setup",
  "classes",
  "subjects",
  "students",
  "teachers",
  "parents",
  "plan",
  "favicon.ico",
  "admin",
  "dashboard",
  "school",
  "schools",
  // Workspace routes — a school path must never swallow them:
  // /teacher, /student and /parent are real pages, not school slugs.
  "teacher",
  "student",
  "parent",
]);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Greenfield Academy" -> "greenfield-academy". Empty input -> "". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Plain-language reason a slug cannot be used, or null if it is fine. */
export function slugProblem(slug: string): string | null {
  if (slug.length < 2 || slug.length > 50)
    return "Short name must be 2–50 characters.";
  if (!SLUG_RE.test(slug))
    return "Use lowercase letters, numbers and hyphens only (e.g. greenfield-academy).";
  if (RESERVED_SLUGS.has(slug))
    return `"${slug}" is reserved — pick another short name.`;
  return null;
}

export function isValidSlug(slug: string): boolean {
  return slugProblem(slug) === null;
}

/** The school path for a slug: "/greenfield". Root (no school): "". */
export function schoolPath(slug: string | null | undefined, sub = ""): string {
  if (!slug) return sub || "/";
  return `/${slug}${sub}`;
}

export type SchoolBySlug = {
  id: string;
  slug: string;
  name: string;
  motto: string | null;
  logo_url: string | null;
};

/** Resolve a path slug to a school (public RPC from migration 0004).
 *  Returns null when no school has that slug. Safe before sign-in:
 *  it returns branding fields only. */
export async function fetchSchoolBySlug(
  slug: string,
): Promise<SchoolBySlug | null> {
  const { data, error } = await supabase.rpc("school_by_slug", {
    p_slug: slug,
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? (row as SchoolBySlug) : null;
}

/** First path segment, when it could be a school slug — "" otherwise.
 *  Used to keep links inside the school's own path (e.g. /greenfield
 *  -> links start with /greenfield). Plain routes return "". */
export function firstSegment(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  return seg && !RESERVED_SLUGS.has(seg) ? seg : "";
}

/** Hook: the workspace base for the current page ("/greenfield" on a
 *  school path, "" on a plain route). Prefix internal workspace links
 *  with this so navigation stays inside the school's own path. */
export function useWorkspaceBase(): string {
  const pathname = usePathname();
  const seg = firstSegment(pathname);
  return seg ? `/${seg}` : "";
}

/** True for the public pages, on plain routes and under a school path:
 *  /login, /greenfield/login, /invite/<token>, /greenfield/invite/…,
 *  /reset-password. */
export function isPublicPath(pathname: string): boolean {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return false;
  if (segs[0] === "login" || segs[0] === "invite" || segs[0] === "reset-password")
    return true;
  if (segs.length >= 2 && (segs[1] === "login" || segs[1] === "invite"))
    return true;
  return false;
}

/** True when the pathname is inside a school path at all. */
export function isSchoolPath(pathname: string): boolean {
  return firstSegment(pathname) !== "";
}
