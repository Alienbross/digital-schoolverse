"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { School } from "@/lib/types";
import { ThemeToggle } from "@/components/theme";
import { SchoolLogo } from "@/components/school-logo";

const SCHOOL_NAV = [
  { href: "/", label: "Overview" },
  { href: "/setup", label: "School Setup" },
  { href: "/classes", label: "Classes & Arms" },
  { href: "/subjects", label: "Subjects" },
  { href: "/students", label: "Students" },
  { href: "/teachers", label: "Teachers & Staff" },
  { href: "/parents", label: "Parents" },
  { href: "/plan", label: "Plan & Roadmap" },
];

const MB_NAV = [
  { href: "/mother-board", label: "Mother Board" },
  { href: "/mother-board/schools", label: "Schools" },
  { href: "/mother-board/logins", label: "Logins & People" },
  { href: "/mother-board/invites", label: "Invites" },
  { href: "/mother-board/analytics", label: "Analytics" },
  { href: "/mother-board/plans", label: "Plans" },
  { href: "/mother-board/support", label: "Support" },
  { href: "/mother-board/access", label: "Access Model" },
];

// Read-only roles see only the overview and the plan; their full
// dashboards (from the Muse portal) are a later port.
const READ_ONLY_NAV = [
  { href: "/", label: "Overview" },
  { href: "/plan", label: "Plan & Roadmap" },
];

const PUBLIC_PREFIXES = ["/login", "/invite", "/reset-password"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, profile, isOwner, ownerSchoolId, setOwnerSchoolId, signOut, schoolId } =
    useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  // The school whose portal this is — its logo brands the header for
  // every user of that school. Mother Board pages keep the platform
  // branding instead (see below).
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);

  const authed = isSupabaseConfigured;

  useEffect(() => {
    if (!authed || loading || !user) return;
    if (!isOwner) return;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name")
        .order("name");
      setSchools((data as School[]) ?? []);
    })();
  }, [authed, loading, user, isOwner]);

  // Load the current school's branding (logo) for the school workspace.
  useEffect(() => {
    if (!authed || loading || !user || !profile) {
      setCurrentSchool(null);
      return;
    }
    const id = profile.school_id ?? ownerSchoolId ?? null;
    if (!id || isPublic(pathname) || pathname.startsWith("/mother-board")) {
      setCurrentSchool(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name, motto, logo_url")
        .eq("id", id)
        .maybeSingle();
      if (alive) setCurrentSchool((data as School | null) ?? null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, loading, user, profile, ownerSchoolId, pathname]);

  useEffect(() => {
    if (!authed || loading || isPublic(pathname)) return;
    if (!user) router.replace("/login");
  }, [authed, loading, user, pathname, router]);

  // Public pages (login / invite / reset password): plain shell.
  if (isPublic(pathname)) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <Link href="/" className="font-bold text-royal">
            Digital SchoolVerse
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    );
  }

  // No Supabase configured yet: the original unauthenticated pilot shell.
  if (!authed) {
    return (
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-royal-deep p-5 text-white md:flex">
          <div className="mb-8">
            <p className="text-xl font-bold leading-tight">Digital SchoolVerse</p>
            <p className="mt-1 text-xs text-skybrand">
              Primary &amp; Secondary School Portal
            </p>
          </div>
          <nav className="flex flex-col gap-1">
            {SCHOOL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="mt-auto pt-8 text-xs text-white/50">
            Free pilot build — Supabase + Vercel.
          </p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
            <p className="font-bold text-royal">Digital SchoolVerse</p>
            <ThemeToggle />
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            {children}
          </main>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-sm text-slate-500">
          Sign in to continue…{" "}
          <Link href="/login" className="font-semibold text-royal">
            Go to sign in →
          </Link>
        </p>
      </main>
    );
  }

  if (profile?.status === "Suspended") {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-bold text-ink">Account suspended</h1>
        <p className="mt-2 text-sm text-slate-500">
          This login has been suspended by the platform owner. Contact your
          school admin or the platform owner to restore access.
        </p>
        <button
          className="mt-4 rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-bold text-ink">Account not set up yet</h1>
        <p className="mt-2 text-sm text-slate-500">
          You are signed in as {user.email}, but this account has no profile
          (role / school) yet. If you came from an invite link, open it again
          while signed in — or ask the platform owner to send you a new
          invite.
        </p>
        <button
          className="mt-4 rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </main>
    );
  }

  const roleLabel = profile.role.replace("_", " ");
  const nav =
    isOwner || profile.role === "school_admin" ? SCHOOL_NAV : READ_ONLY_NAV;
  const inMotherBoard = pathname.startsWith("/mother-board");

  const navLinks = (items: { href: string; label: string }[]) =>
    items.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        className="rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
      >
        {item.label}
      </Link>
    ));

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-royal-deep p-5 text-white md:flex">
        {inMotherBoard || !currentSchool ? (
          <div className="mb-6">
            <p className="text-xl font-bold leading-tight">Digital SchoolVerse</p>
            <p className="mt-1 text-xs text-skybrand">
              Primary &amp; Secondary School Portal
            </p>
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-3">
            <SchoolLogo name={currentSchool.name} logoUrl={currentSchool.logo_url} size={44} />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight">{currentSchool.name}</p>
              <p className="mt-0.5 text-xs text-skybrand">Digital SchoolVerse</p>
            </div>
          </div>
        )}

        {isOwner && (
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              Mother Board
            </p>
            <nav className="flex flex-col gap-1">{navLinks(MB_NAV)}</nav>
            <label className="mt-4 mb-1 block text-xs font-semibold text-white/60">
              View school workspace as
            </label>
            <select
              className="w-full rounded-lg border border-white/20 bg-royal-deep px-2 py-2 text-sm text-white"
              value={ownerSchoolId ?? ""}
              onChange={(e) => setOwnerSchoolId(e.target.value || null)}
            >
              <option value="">— All schools (overview) —</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
          {isOwner ? "School workspace" : "My school"}
        </p>
        <nav className="flex flex-col gap-1">{navLinks(nav)}</nav>

        <div className="mt-auto pt-8">
          <ThemeToggle />
          <p className="mt-3 text-xs text-white/70">
            {profile.display_name ?? profile.email}
            <br />
            {roleLabel}
            {inMotherBoard ? " · Mother Board" : ""}
          </p>
          <button
            className="mt-2 text-xs font-semibold text-skybrand hover:text-white"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-white px-4 py-3 md:hidden">
          <div className="flex items-center justify-between">
            {inMotherBoard || !currentSchool ? (
              <p className="font-bold text-royal">Digital SchoolVerse</p>
            ) : (
              <span className="flex items-center gap-2">
                <SchoolLogo name={currentSchool.name} logoUrl={currentSchool.logo_url} size={28} />
                <span className="font-bold text-royal">{currentSchool.name}</span>
              </span>
            )}
            <ThemeToggle />
          </div>
          <nav className="mt-2 flex gap-3 overflow-x-auto text-sm">
            {(isOwner ? [...MB_NAV, ...nav] : nav).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap font-medium text-slate-600 hover:text-royal"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {isOwner && (
            <select
              className="mt-2 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
              value={ownerSchoolId ?? ""}
              onChange={(e) => setOwnerSchoolId(e.target.value || null)}
              aria-label="View school workspace as"
            >
              <option value="">— All schools (overview) —</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {profile.email} · {roleLabel} ·{" "}
            <button className="font-semibold text-royal" onClick={() => signOut()}>
              Sign out
            </button>
          </p>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
