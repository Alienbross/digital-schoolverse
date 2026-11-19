"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import { schoolCounts } from "@/lib/mother-board";
import { Card } from "@/components/ui";

type Row = {
  school: School;
  students: number;
  teachers: number;
  parents: number;
  openComplaints: number;
  feesCollected: number;
  invitesAccepted: number;
};

export default function MotherBoardAnalytics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ schools: 0, logins: 0, students: 0, teachers: 0, parents: 0, fees: 0, complaints: 0 });

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("schools").select("*").order("name");
      const schools = (s as School[]) ?? [];
      const next: Row[] = [];
      let students = 0, teachers = 0, parents = 0, fees = 0, complaints = 0;
      for (const school of schools) {
        const c = await schoolCounts(school.id);
        const { data: pay } = await supabase
          .from("fee_payments")
          .select("amount")
          .eq("school_id", school.id);
        const collected = (pay ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount || 0), 0);
        const { count: acc } = await supabase
          .from("invites")
          .select("*", { count: "exact", head: true })
          .eq("school_id", school.id)
          .eq("status", "Accepted");
        students += c.students; teachers += c.teachers; parents += c.parents;
        fees += collected; complaints += c.openComplaints;
        next.push({ school, ...c, feesCollected: collected, invitesAccepted: acc ?? 0 });
      }
      const { count: lc } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      setRows(next);
      setTotals({ schools: schools.length, logins: lc ?? 0, students, teachers, parents, fees, complaints });
    })();
  }, []);

  const fmt = (n: number) => `₦${n.toLocaleString()}`;
  const maxStudents = Math.max(1, ...rows.map((r) => r.students));

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Schools", value: totals.schools },
          { label: "Logins", value: totals.logins },
          { label: "Pupils (all schools)", value: totals.students },
          { label: "Fees collected (all schools)", value: fmt(totals.fees) },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-2xl font-bold text-royal">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Per school</h2>
        <ul className="space-y-3 text-sm">
          {rows.map((r) => (
            <li key={r.school.id} className="rounded-lg bg-mist px-3 py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{r.school.name}</strong>
                <span className="text-xs text-slate-500">{r.school.plan} · {r.school.status}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded bg-white">
                <div className="h-2 rounded bg-royal" style={{ width: `${Math.round((r.students / maxStudents) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {r.students} pupils · {r.teachers} teachers · {r.parents} parents ·{" "}
                {r.openComplaints} open complaints · {fmt(r.feesCollected)} collected ·{" "}
                {r.invitesAccepted} invite(s) accepted
              </p>
            </li>
          ))}
          {rows.length === 0 && <li className="text-slate-400">No schools yet.</li>}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Fees collected sums recorded fee payments per school. Deeper
          analytics (at-risk pupils, attendance trends, fee collection over
          time) live in the Advanced analytics feature, ported next from the
          Muse portal.
        </p>
      </Card>
    </div>
  );
}
