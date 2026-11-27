"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { firstSegment, isPublicPath } from "@/lib/slug";
import type { School } from "@/lib/types";
import { ThemeToggle } from "@/components/theme";
import { SchoolLogo } from "@/components/school-logo";
import NotificationsBell from "@/components/notifications-bell";
import { PendingBanner } from "@/components/pending-banner";
import { InstallAppButton, InstallBanner } from "@/components/install-app";

const SCHOOL_NAV = [
  { href: "/", label: "Overview" },
  { href: "/setup", label: "School Setup" },
  { href: "/registration", label: "Registration & Approvals" },
  { href: "/classes", label: "Classes & Arms" },
  { href: "/subjects", label: "Subjects" },
  { href: "/students", label: "Students" },
  { href: "/assessments", label: "Assessments" },
  { href: "/admissions", label: "Admissions" },
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

// Each role lands in its own workspace; the admin/owner keep the
// full school workspace. The platform owner also sees the Mother
// Board nav above.
const TEACHER_NAV = [
  { href: "/teacher", label: "Teacher workspace" },
  { href: "/games", label: "Games" },
  { href: "/plan", label: "Plan & Roadmap" },
];

const STUDENT_NAV = [
  { href: "/student", label: "Student workspace" },
  { href: "/games", label: "Games" },
  { href: "/plan", label: "Plan & Roadmap" },
];

const PARENT_NAV = [
  { href: "/parent", label: "Parent workspace" },
  { href: "/games", label: "Games" },
  { href: "/plan", label: "Plan & Roadmap" },
];

const PUBLIC_PREFIXES = ["/login", "/invite", "/reset-password"];

/** Active-nav matching. Root items (Overview "/", Mother Board
 *  "/mother-board") match exactly; every other item also matches its
 *  sub-pages, so /students/123/report-card still highlights Students
 *  and /mother-board/schools/123 still highlights Schools. */
function navItemActive(pathname: string, href: string, isRoot: boolean): boolean {
  if (isRoot) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar link classes. The sidebar is deep navy (#0B2A6B) in both
 *  themes, so the active item gets the brand royal blue (#1D4ED8)
 *  background with white bold text and a sky (#38BDF8) left accent
 *  bar - readable at a glance in Light and Dark. */
function sidebarLinkClass(active: boolean): string {
  return active
    ? "relative rounded-lg bg-royal px-3 py-2 text-sm font-semibold text-white shadow-[inset_4px_0_0_#38BDF8]"
    : "rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white";
}

function isPublic(pathname: string) {
  return isPublicPath(pathname);
}

/** Prefix a workspace link with the school's path base ("/greenfield"
 *  -> "/greenfield/students"; plain routes unchanged). */
function withBase(base: string, href: string) {
  if (!base) return href;
  return href === "/" ? base : `${base}${href}`;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, profile, isOwner, ownerSchoolId, setOwnerSchoolId, signOut, schoolId, setPathSlug, pathSchool } =
    useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  // Phone menu drawer (hamburger). Desktop keeps the fixed sidebar;
  // on a phone the menu opens as a slide-in sidebar instead of the
  // old sideways-sliding strip at the top.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The school whose portal this is - its logo brands the header for
  // every user of that school. Mother Board pages keep the platform
  // branding instead (see below).
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);

  const authed = isSupabaseConfigured;

  // The school path in the URL (/<slug>/…): tell the auth context so
  // the session scopes to that school, and links stay inside it.
  const base = (() => {
    const seg = firstSegment(pathname);
    return seg ? `/${seg}` : "";
  })();
  useEffect(() => {
    setPathSlug(firstSegment(pathname) || null);
  }, [pathname, setPathSlug]);

  // Password-recovery links sent from the Supabase dashboard land on
  // "/" with type=recovery in the URL hash and no redirect to the
  // reset page, so the user never sees the password form. Catch that
  // hash here and send them to /reset-password. Only a recovery hash
  // triggers this; normal sign-ins are untouched. Wait for the
  // session first, so the recovery token is stored before the hash
  // is left behind.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") !== "recovery") return;
    if (pathname.endsWith("/reset-password")) return;
    let alive = true;
    (async () => {
      await supabase.auth.getSession();
      if (alive) router.replace("/reset-password");
    })();
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  // Close the phone drawer whenever the page changes, so tapping a
  // menu item never leaves the drawer (or its overlay) behind.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // While the drawer is open, stop the page behind it scrolling and
  // let Escape close it. Both are undone when it closes.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  // The owner picking a school in the header opens that school's own
  // path (e.g. /greenfield); picking "All schools" goes back to "/".
  const pickSchool = useCallback((id: string) => {
    setOwnerSchoolId(id || null);
    if (!id) {
      router.push("/");
      return;
    }
    const school = schools.find((s) => s.id === id);
    router.push(school?.slug ? `/${school.slug}` : "/");
  }, [router, schools, setOwnerSchoolId]);

  useEffect(() => {
    if (!authed || loading || !user) return;
    if (!isOwner) return;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name, slug")
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
    const id = schoolId ?? null;
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
    if (!user) router.replace(base ? `${base}/login` : "/login");
  }, [authed, loading, user, pathname, router, base]);

  // Public pages (login / invite / reset password): plain shell.
  if (isPublic(pathname)) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <Link href={base || "/"} className="font-bold text-royal">
            Digital SchoolVerse
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          <InstallBanner />
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
            {SCHOOL_NAV.map((item) => {
              const href = withBase(base, item.href);
              const active = navItemActive(pathname, href, item.href === "/");
              return (
                <Link
                  key={item.href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={sidebarLinkClass(active)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <p className="mt-auto pt-8 text-xs text-white/50">
            Free pilot build - Supabase + Vercel.
          </p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
            <p className="font-bold text-royal">Digital SchoolVerse</p>
            <ThemeToggle />
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            <InstallBanner />
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
          <Link href={base ? `${base}/login` : "/login"} className="font-semibold text-royal">
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
          while signed in - or ask the platform owner to send you a new
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
    isOwner || profile.role === "school_admin"
      ? SCHOOL_NAV
      : profile.role === "teacher"
        ? TEACHER_NAV
        : profile.role === "student"
          ? STUDENT_NAV
          : PARENT_NAV;
  const inMotherBoard = pathname.startsWith("/mother-board");

  const navLinks = (
    items: { href: string; label: string }[],
    opts: { base?: string; rootHref?: string } = {},
  ) =>
    items.map((item) => {
      const href = opts.base ? withBase(opts.base, item.href) : item.href;
      const active = navItemActive(pathname, href, item.href === (opts.rootHref ?? "/"));
      return (
        <Link
          key={item.href}
          href={href}
          aria-current={active ? "page" : undefined}
          onClick={() => setDrawerOpen(false)}
          className={sidebarLinkClass(active)}
        >
          {item.label}
        </Link>
      );
    });

  // Phone drawer items: Mother Board nav first for the owner, then
  // the school workspace nav - same order and labels as the desktop
  // sidebar, with the school path base applied to workspace items.
  const drawerItems = (isOwner ? [...MB_NAV, ...nav] : nav).map((item) => ({
    ...item,
    href: item.href.startsWith("/mother-board") ? item.href : withBase(base, item.href),
    rootHref: item.href === "/" || item.href === "/mother-board" ? item.href : undefined,
  }));

  return (
    <div className="flex min-h-screen">
      {/* Phone menu drawer: hamburger opens a slide-in sidebar from
          the left (deep navy, same as the desktop sidebar). Hidden on
          desktop (md and up), where the fixed sidebar is used. */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={drawerOpen ? 0 : -1}
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity ${drawerOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto bg-royal-deep p-5 text-white shadow-xl transition-transform duration-200 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
          role="dialog"
          aria-label="Menu"
        >
          <div className="mb-6 flex items-center justify-between">
            {inMotherBoard || !currentSchool ? (
              <p className="text-lg font-bold leading-tight">Digital SchoolVerse</p>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <SchoolLogo name={currentSchool.name} logoUrl={currentSchool.logo_url} size={32} />
                <span className="truncate text-lg font-bold leading-tight">{currentSchool.name}</span>
              </span>
            )}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-white/85 hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            {drawerItems.map((item) => {
              const active = navItemActive(
                pathname,
                item.href,
                item.href === (item.rootHref ?? "/"),
              );
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                  className={sidebarLinkClass(active)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {isOwner && (
            <div className="mt-6">
              <label className="mb-1 block text-xs font-semibold text-white/60">
                View school workspace as
              </label>
              <select
                className="w-full rounded-lg border border-white/20 bg-royal-deep px-2 py-2 text-sm text-white"
                value={pathSchool?.id ?? ownerSchoolId ?? ""}
                onChange={(e) => pickSchool(e.target.value)}
                aria-label="View school workspace as"
              >
                <option value="">- All schools (overview) -</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            <div className="mt-2">
              <InstallAppButton />
            </div>
          </div>
        </aside>
      </div>

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
            <nav className="flex flex-col gap-1">{navLinks(MB_NAV, { rootHref: "/mother-board" })}</nav>
            <label className="mt-4 mb-1 block text-xs font-semibold text-white/60">
              View school workspace as
            </label>
            <select
              className="w-full rounded-lg border border-white/20 bg-royal-deep px-2 py-2 text-sm text-white"
              value={pathSchool?.id ?? ownerSchoolId ?? ""}
              onChange={(e) => pickSchool(e.target.value)}
            >
              <option value="">- All schools (overview) -</option>
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
        <nav className="flex flex-col gap-1">{navLinks(nav, { base })}</nav>

        <div className="mt-auto pt-8">
          <NotificationsBell />
          <div className="mt-3">
            <ThemeToggle />
          </div>
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
          <div className="mt-2">
            <InstallAppButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-white px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
                className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-lg font-bold leading-none text-royal"
              >
                ☰
              </button>
            {inMotherBoard || !currentSchool ? (
              <p className="truncate font-bold text-royal">Digital SchoolVerse</p>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <SchoolLogo name={currentSchool.name} logoUrl={currentSchool.logo_url} size={28} />
                <span className="truncate font-bold text-royal">{currentSchool.name}</span>
              </span>
            )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationsBell />
              <ThemeToggle />
            </div>
          </div>
          {isOwner && (
            <select
              className="mt-2 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
              value={pathSchool?.id ?? ownerSchoolId ?? ""}
              onChange={(e) => pickSchool(e.target.value)}
              aria-label="View school workspace as"
            >
              <option value="">- All schools (overview) -</option>
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
          <InstallBanner />
          {profile && <PendingBanner profile={profile} />}
          {children}
        </main>
      </div>
    </div>
  );
}
