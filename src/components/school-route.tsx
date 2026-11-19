"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { schoolPath } from "@/lib/slug";

/** "School not found" - the /<slug> in the URL has no school. */
export function SchoolNotFound({ slug }: { slug: string }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold text-ink">School not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        There is no school at <strong>/{slug}</strong> on Digital
        SchoolVerse. Check the link, or ask the platform owner for the
        school&apos;s correct address.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-semibold text-royal">
          Go to sign in →
        </Link>
      </p>
    </main>
  );
}

/** A signed-in user of one school opening another school's path. */
function WrongSchool({ slug, ownSchoolId }: { slug: string; ownSchoolId: string }) {
  const [ownSlug, setOwnSlug] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("slug")
        .eq("id", ownSchoolId)
        .maybeSingle();
      setOwnSlug((data as { slug: string } | null)?.slug ?? null);
    })();
  }, [ownSchoolId]);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold text-ink">
        This portal belongs to another school
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        <strong>/{slug}</strong> is a different school&apos;s portal, and
        your login belongs to another school. You can only see your own
        school&apos;s data.
      </p>
      <p className="mt-4 text-sm">
        {ownSlug ? (
          <Link href={schoolPath(ownSlug)} className="font-semibold text-royal">
            Go to my school&apos;s portal →
          </Link>
        ) : (
          <Link href="/" className="font-semibold text-royal">
            Go to my portal →
          </Link>
        )}
      </p>
    </main>
  );
}

/** Guard for every /<slug>/… workspace page: the slug must be a real
 *  school, and a signed-in school user may only open their own
 *  school's path. The platform owner may open any school's path.
 *  RLS (migration 0002) is the backstop - this is the page the user
 *  sees instead of an empty portal. */
export function SchoolWorkspace({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const { loading, user, profile, isOwner, pathSchool, pathSchoolStatus } =
    useAuth();

  // No Supabase configured (local dev without keys): pages work
  // unauthenticated, as before.
  if (!isSupabaseConfigured) return <>{children}</>;
  if (loading || pathSchoolStatus === "loading") {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }
  if (pathSchoolStatus === "not-found" || !pathSchool) {
    return <SchoolNotFound slug={slug} />;
  }
  if (
    user &&
    !isOwner &&
    profile?.school_id &&
    profile.school_id !== pathSchool.id
  ) {
    return <WrongSchool slug={slug} ownSchoolId={profile.school_id} />;
  }
  return <>{children}</>;
}
