"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth, useCanManage } from "@/lib/auth";
import { useWorkspaceBase } from "@/lib/slug";
import { Card, ConfigBanner, PageHeader } from "@/components/ui";
import AbsenceNoticesLog from "@/components/workspace/absence-notices";
import { TeacherTaskCounts } from "@/components/workspace/teacher-reminders";

type Counts = {
  schools: number;
  classes: number;
  students: number;
  teachers: number;
  parents: number;
  terms: number;
  subjects: number;
  applications: number;
};

export default function Overview() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  // On a school path (/greenfield) links stay inside that school's path.
  const base = useWorkspaceBase();
  const canManage = useCanManage();
  const router = useRouter();
  const pathname = usePathname();

  // Teachers, students and parents land in their own workspace, not
  // on the admin overview - send them there when they open the root
  // of a school portal (login already does this; this covers a
  // bookmarked /greenfield or a plain / visit).
  useEffect(() => {
    if (authLoading || !profile) return;
    const atRoot = pathname === "/" || pathname === base;
    if (!atRoot) return;
    if (profile.role === "teacher") router.replace(`${base}/teacher`);
    else if (profile.role === "student") router.replace(`${base}/student`);
    else if (profile.role === "parent") router.replace(`${base}/parent`);
  }, [authLoading, profile, pathname, base, router]);
  const [counts, setCounts] = useState<Counts>({
    schools: 0,
    classes: 0,
    students: 0,
    teachers: 0,
    parents: 0,
    terms: 0,
    subjects: 0,
    applications: 0,
  });
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || authLoading) return;
    (async () => {
      const tables: (keyof Counts)[] = [
        "schools",
        "classes",
        "students",
        "teachers",
        "parents",
        "terms",
        "subjects",
        "applications",
      ];
      const next: Counts = { ...counts };
      for (const t of tables) {
        const table = t === "applications" ? "admission_applications" : t;
        let q = supabase.from(table).select("*", { count: "exact", head: true });
        // School users see only their school; the platform owner sees all
        // (or the school they picked in the header).
        if (schoolId && t !== "schools") q = q.eq("school_id", schoolId);
        if (schoolId && t === "schools") q = q.eq("id", schoolId);
        const { count } = await q;
        next[t] = count ?? 0;
      }
      setCounts(next);
      let schoolQuery = supabase
        .from("schools")
        .select("name")
        .order("created_at", { ascending: true })
        .limit(1);
      if (schoolId) schoolQuery = supabase.from("schools").select("name").eq("id", schoolId);
      const { data } = await schoolQuery.single();
      if (data) setSchoolName(data.name);
      // Pending registrations waiting for approval (migration 0006).
      if (schoolId) {
        const { count: pc } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "Pending");
        setPendingCount(pc ?? 0);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId]);

  const steps = [
    { label: "Add your school profile", done: counts.schools > 0, href: `${base}/setup` },
    { label: "Set a session & current term", done: counts.terms > 0, href: `${base}/setup` },
    { label: "Create classes & arms", done: counts.classes > 0, href: `${base}/classes` },
    { label: "Add subjects", done: counts.subjects > 0, href: `${base}/subjects` },
    { label: "Add students (auto admission numbers DSV/…)", done: counts.students > 0, href: `${base}/students` },
    { label: "Open admissions - first application received (ADM-…)", done: counts.applications > 0, href: `${base}/admissions` },
    { label: "Add teachers & staff", done: counts.teachers > 0, href: `${base}/teachers` },
    { label: "Add parents & link them to children", done: counts.parents > 0, href: `${base}/parents` },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const cards = [
    { label: "Students", value: counts.students, href: `${base}/students` },
    { label: "Classes", value: counts.classes, href: `${base}/classes` },
    { label: "Subjects", value: counts.subjects, href: `${base}/subjects` },
    { label: "Teachers & Staff", value: counts.teachers, href: `${base}/teachers` },
    { label: "Parents", value: counts.parents, href: `${base}/parents` },
    { label: "Applications", value: counts.applications, href: `${base}/admissions` },
  ];

  return (
    <div>
      <ConfigBanner />
      {profile && !canManage && (
        <div className="mb-4 rounded-xl border border-skybrand/40 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Signed in as {profile.role.replace("_", " ")} - your workspace is{" "}
          <Link href={`${base}/${profile.role}`} className="font-semibold text-royal">
            here →
          </Link>
        </div>
      )}
      <PageHeader
        title={schoolName ? `Welcome - ${schoolName}` : "Welcome to Digital SchoolVerse"}
        sub="Foundation + Admin core. Basics first - Advanced features live behind the paywall."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card>
              <p className="text-3xl font-bold text-royal">{c.value}</p>
              <p className="text-sm text-slate-500">{c.label}</p>
            </Card>
          </Link>
        ))}
      </div>
      {canManage && (
        <Link href={`${base}/registration`}>
          <Card>
            <p className="text-3xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-sm text-slate-500">
              Registrations waiting for approval{" "}
              <span className="font-semibold text-royal">Review →</span>
            </p>
          </Card>
        </Link>
      )}
      {canManage && schoolId && (
        <div className="mb-6">
          <TeacherTaskCounts schoolId={schoolId} />
        </div>
      )}
      {canManage && schoolId && (
        <div className="mb-6">
          <AbsenceNoticesLog
            schoolId={schoolId}
            mode="staff"
            title="Absence emails - all classes"
            showDatePicker
          />
        </div>
      )}
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          Setup checklist - {doneCount} of {steps.length} done
        </h2>
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  s.done ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
                }`}
              >
                {s.done ? "✓" : "•"}
              </span>
              <span className={s.done ? "text-slate-400 line-through" : ""}>
                {s.label}
              </span>
              {!s.done && (
                <Link href={s.href} className="ml-auto font-semibold text-royal">
                  Go →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-6 text-xs text-slate-400">
        Teacher, Student and Parent workspaces are live in this build:
        registers, scores, homework, timetables, CBT practice, fees,
        complaints, messages and AI drafting assistants.
      </p>
    </div>
  );
}
