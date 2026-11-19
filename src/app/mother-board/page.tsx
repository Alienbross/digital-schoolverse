"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import { Card } from "@/components/ui";

type ComplaintRow = {
  id: string;
  reference: string;
  school_id: string;
  subject: string | null;
  priority: string;
  status: string;
  created_at: string;
};

export default function MotherBoardOverview() {
  const [schools, setSchools] = useState<School[]>([]);
  const [logins, setLogins] = useState(0);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [urgent, setUrgent] = useState<ComplaintRow[]>([]);
  const [openComplaints, setOpenComplaints] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("schools").select("*").order("created_at");
      setSchools((s as School[]) ?? []);
      const { count: lc } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      setLogins(lc ?? 0);
      const { count: pi } = await supabase
        .from("invites")
        .select("*", { count: "exact", head: true })
        .eq("status", "Pending");
      setPendingInvites(pi ?? 0);
      const { count: oc } = await supabase
        .from("complaints")
        .select("*", { count: "exact", head: true })
        .neq("status", "Resolved");
      setOpenComplaints(oc ?? 0);
      const { data: u } = await supabase
        .from("complaints")
        .select("id, reference, school_id, subject, priority, status, created_at")
        .eq("priority", "Urgent")
        .neq("status", "Resolved")
        .order("created_at", { ascending: false })
        .limit(5);
      setUrgent((u as ComplaintRow[]) ?? []);
    })();
  }, []);

  const schoolName = (id: string) =>
    schools.find((s) => s.id === id)?.name ?? "—";
  const active = schools.filter((s) => s.status === "Active").length;
  const advanced = schools.filter((s) => s.plan === "Advanced").length;

  const stats = [
    { label: "Schools", value: schools.length, sub: `${active} active`, href: "/mother-board/schools" },
    { label: "Logins", value: logins, sub: "admins, teachers, students, parents", href: "/mother-board/logins" },
    { label: "Pending invites", value: pendingInvites, sub: "waiting to be accepted", href: "/mother-board/invites" },
    { label: "Open complaints", value: openComplaints, sub: "across all schools", href: "/mother-board/support" },
    { label: "Advanced plans", value: advanced, sub: `of ${schools.length} schools`, href: "/mother-board/plans" },
  ];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card>
              <p className="text-3xl font-bold text-royal">{s.value}</p>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-slate-500">{s.sub}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Schools</h2>
          <ul className="space-y-2 text-sm">
            {schools.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                <span>
                  <strong>{s.name}</strong>{" "}
                  <span className="text-xs text-slate-500">
                    {s.plan} · {s.status}
                  </span>
                </span>
                <Link href={`/mother-board/schools/${s.id}`} className="font-semibold text-royal">
                  Control →
                </Link>
              </li>
            ))}
            {schools.length === 0 && (
              <li className="text-slate-400">
                No schools yet — create the first one on the Schools page.
              </li>
            )}
          </ul>
          <Link href="/mother-board/schools" className="mt-3 inline-block text-sm font-semibold text-royal">
            + New school
          </Link>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Urgent complaints — needs attention first</h2>
          <ul className="space-y-2 text-sm">
            {urgent.map((c) => (
              <li key={c.id} className="rounded-lg bg-mist px-3 py-2">
                <strong>{c.reference}</strong> · {schoolName(c.school_id)}
                <span className="block text-xs text-slate-500">
                  {c.subject ?? "No subject"} · {c.status}
                </span>
              </li>
            ))}
            {urgent.length === 0 && (
              <li className="text-slate-400">No urgent complaints open.</li>
            )}
          </ul>
          <Link href="/mother-board/support" className="mt-3 inline-block text-sm font-semibold text-royal">
            Open Support →
          </Link>
        </Card>
      </div>
    </div>
  );
}
