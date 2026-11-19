"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import { Card } from "@/components/ui";

export default function MotherBoardPlans() {
  const [schools, setSchools] = useState<School[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data } = await supabase.from("schools").select("*").order("name");
    setSchools((data as School[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const setPlan = async (s: School, plan: string) => {
    const { error } = await supabase.from("schools").update({ plan }).eq("id", s.id);
    setMsg(error ? `Could not update: ${error.message}` : `${s.name} moved to ${plan}.`);
    load();
  };

  const basics = schools.filter((s) => s.plan === "Basics");
  const advanced = schools.filter((s) => s.plan === "Advanced");

  const group = (title: string, list: School[], note: string) => (
    <Card>
      <h2 className="mb-1 font-semibold">{title} ({list.length})</h2>
      <p className="mb-3 text-xs text-slate-500">{note}</p>
      <ul className="space-y-2 text-sm">
        {list.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
            <span><strong>{s.name}</strong> · {s.status}</span>
            <select
              className="rounded border border-line bg-white px-2 py-1 text-xs"
              value={s.plan}
              onChange={(e) => setPlan(s, e.target.value)}
              aria-label={`Plan for ${s.name}`}
            >
              <option>Basics</option>
              <option>Advanced</option>
            </select>
          </li>
        ))}
        {list.length === 0 && <li className="text-slate-400">None.</li>}
      </ul>
    </Card>
  );

  return (
    <div>
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {group(
          "Basics",
          basics,
          "Foundation + Admin core, attendance, scores, fees, complaints, homework, messages, admissions.",
        )}
        {group(
          "Advanced — behind the paywall",
          advanced,
          "AI Teacher Assistant, online fee payment, CBT, analytics, SMS/WhatsApp, weekly summaries, bus/clinic/discipline, multi-branch report cards, online complaint forms.",
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        A school admin cannot change their own plan — they request an upgrade
        and the platform owner moves them here. Real billing (Paystack) is
        not connected yet.
      </p>
    </div>
  );
}
