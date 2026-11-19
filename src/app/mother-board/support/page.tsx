"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import { Card, inputCls, labelCls } from "@/components/ui";

type ComplaintRow = {
  id: string;
  reference: string;
  school_id: string;
  category: string;
  priority: string;
  subject: string | null;
  details: string | null;
  status: string;
  created_at: string;
};

const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

export default function MotherBoardSupport() {
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data: c } = await supabase
      .from("complaints")
      .select("id, reference, school_id, category, priority, subject, details, status, created_at")
      .order("created_at", { ascending: false });
    setComplaints(((c as ComplaintRow[]) ?? []).sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
    ));
    const { data: s } = await supabase.from("schools").select("*").order("name");
    setSchools((s as School[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const schoolName = (id: string) =>
    schools.find((s) => s.id === id)?.name ?? "—";

  const setStatus = async (c: ComplaintRow, status: string) => {
    const patch: Record<string, unknown> = { status };
    if (status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("complaints").update(patch).eq("id", c.id);
    setMsg(error ? `Could not update: ${error.message}` : `${c.reference} → ${status}.`);
    load();
  };

  const filtered = complaints.filter((c) => !statusFilter || c.status === statusFilter);

  return (
    <div>
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <Card>
        <div className="mb-3 flex items-end gap-3">
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option>Open</option>
              <option>In progress</option>
              <option>Resolved</option>
            </select>
          </div>
          <span className="text-sm text-slate-500">{filtered.length} complaint(s), urgent first</span>
        </div>
        <ul className="space-y-2 text-sm">
          {filtered.map((c) => (
            <li key={c.id} className="rounded-lg bg-mist px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{c.reference}</strong> · {schoolName(c.school_id)} · {c.category}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${c.priority === "Urgent" ? "bg-red-100 text-red-700" : "bg-white text-slate-600"}`}>
                  {c.priority}
                </span>
              </div>
              <p className="mt-1">{c.subject ?? "No subject"}</p>
              {c.details && <p className="mt-1 text-xs text-slate-500">{c.details}</p>}
              <div className="mt-2 flex items-center gap-2 text-xs">
                <label className="text-slate-500">Status</label>
                <select
                  className="rounded border border-line bg-white px-2 py-1"
                  value={c.status}
                  onChange={(e) => setStatus(c, e.target.value)}
                >
                  <option>Open</option>
                  <option>In progress</option>
                  <option>Resolved</option>
                </select>
                <span className="text-slate-400">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
            </li>
          ))}
          {filtered.length === 0 && <li className="text-slate-400">No complaints yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
