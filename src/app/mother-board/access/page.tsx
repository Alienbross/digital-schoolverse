import { Card, PageHeader } from "@/components/ui";

const ROWS: { who: string; can: string[]; cannot: string[] }[] = [
  {
    who: "Platform owner - Mother Board (you)",
    can: [
      "Create, suspend and delete schools; set any school's plan (Basics / Advanced) and status (Trial / Active / Suspended).",
      "Generate, resend, revoke and reset ANY login - school admin, teacher, student or parent - in any school.",
      "See every school's people, complaints, fees and analytics across the whole platform.",
      "Delete a school and all of its data.",
    ],
    cannot: ["Nothing is out of reach - full control over everything."],
  },
  {
    who: "School admin - one school",
    can: [
      "Set up their own school: profile, terms, classes, subjects, students, teachers, parents.",
      "Generate logins for their own teachers, students and parents, and reset them.",
      "See only their own school's data - never another school's.",
    ],
    cannot: [
      "Cannot create a new school, see other schools, or open the Mother Board.",
      "Cannot change their own plan - they request an upgrade from the platform owner.",
      "Cannot see or change platform-wide analytics or billing.",
    ],
  },
  {
    who: "Teacher",
    can: [
      "See their own school's classes, pupils and registers (read-only in this build).",
      "Their full workspace (attendance, scores, lesson notes, AI assistant) is ported next from the Muse portal.",
    ],
    cannot: [
      "Cannot add or edit school records, and cannot see other schools.",
    ],
  },
  {
    who: "Student",
    can: [
      "See their own school's overview (read-only in this build).",
      "Their full workspace (subjects, homework, results, CBT, AI tutor) is ported next from the Muse portal.",
    ],
    cannot: ["Cannot see other pupils' records or other schools."],
  },
  {
    who: "Parent",
    can: [
      "See their own school's overview (read-only in this build).",
      "Their full workspace (children, attendance, results, fees, weekly summaries) is ported next from the Muse portal.",
    ],
    cannot: ["Cannot see other families' records or other schools."],
  },
];

export default function AccessModel() {
  return (
    <div>
      <PageHeader
        title="Access Model"
        sub="Who can do what on Digital SchoolVerse. Enforced by Supabase Auth + row-level security (migration 0002), not just by hiding buttons."
      />
      <div className="space-y-4">
        {ROWS.map((r) => (
          <Card key={r.who}>
            <h2 className="mb-2 font-semibold">{r.who}</h2>
            <p className="mb-1 text-xs font-semibold text-green-700">CAN</p>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">
              {r.can.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="mb-1 text-xs font-semibold text-red-700">CANNOT</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {r.cannot.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        How it works: every login has a profile row (role + school). Every
        database row carries a school_id, and the database itself refuses
        rows from another school - even if someone calls the API directly.
        The platform owner is the only role with no school_id, and the only
        role that can see everything.
      </p>
    </div>
  );
}
