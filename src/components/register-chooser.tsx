"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchRegistrationStatus } from "@/lib/registration";
import { SchoolLogo } from "@/components/school-logo";
import { Card, ConfigBanner, PageHeader } from "@/components/ui";
import type { RegisterRole, RegistrationStatus } from "@/lib/types";

const ROLES: { id: RegisterRole; title: string; blurb: string }[] = [
  {
    id: "teacher",
    title: "Teacher",
    blurb: "Teach classes, take registers and enter scores. Teachers register first.",
  },
  {
    id: "student",
    title: "Student",
    blurb: "Pick your class and use the student workspace. Students register after teachers.",
  },
  {
    id: "parent",
    title: "Parent",
    blurb: "Add your children under you and follow their school life. Parents register last.",
  },
];

/** Public registration chooser: /<slug>/register. Shows which phases
 *  the school has opened and links to each role's form. */
export default function RegisterChooser({ slug }: { slug: string }) {
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found">("loading");

  useEffect(() => {
    (async () => {
      const s = await fetchRegistrationStatus(slug);
      if (!s) {
        setState("not-found");
        return;
      }
      setStatus(s);
      setState("ready");
    })();
  }, [slug]);

  if (state === "loading") {
    return <p className="text-sm text-slate-500">Loading registration…</p>;
  }

  if (state === "not-found" || !status) {
    return (
      <div>
        <PageHeader title="School not found" sub="There is no school at this address on Digital SchoolVerse." />
        <p className="text-sm text-slate-500">
          Check the link, or ask the platform owner for the school&apos;s correct address.
        </p>
      </div>
    );
  }

  const school = status.school;
  const anyOpen = status.phases.teacher || status.phases.student || status.phases.parent;

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title={`Register at ${school.name}`}
        sub="No invite needed - pick who you are. Every registration waits for the school to approve it before you get full access."
      />
      <div className="mb-6 flex items-center gap-3">
        <SchoolLogo name={school.name} logoUrl={school.logo_url} size={56} />
        <div>
          <p className="font-bold text-ink">{school.name}</p>
          {school.motto && <p className="text-sm italic text-slate-500">{school.motto}</p>}
        </div>
      </div>

      {!anyOpen && (
        <Card>
          <h2 className="font-semibold">Registration is not open yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            {school.name} has not opened registration. The school opens it in
            order - teachers first, then students, then parents. Ask the
            school admin when it opens.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {ROLES.map((r) => {
          const open = status.phases[r.id];
          return (
            <Card key={r.id}>
              <h2 className="font-semibold">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{r.blurb}</p>
              <p className="mt-2 text-sm">
                {open ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                    Registration open
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    Not open yet
                  </span>
                )}
              </p>
              {open && (
                <Link
                  href={`/${slug}/register/${r.id}`}
                  className="mt-3 inline-block rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-royal-dark"
                >
                  Register as {r.title.toLowerCase()} →
                </Link>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Already have an account?{" "}
        <Link href={`/${slug}/login`} className="font-semibold text-royal">
          Sign in →
        </Link>
      </p>
    </div>
  );
}
