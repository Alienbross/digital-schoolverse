// Weekly and monthly assessment reports to parents (migration
// 0025 for monthly_summaries; weekly_summaries is from 0001).
// Admin mode: pick a pupil and a week or month, generate the summary
// from live saved data, then save it as a draft or share it with the
// parent. Parent mode: read-only list of Shared summaries for their
// linked children.
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { Student } from "@/lib/types";
import { todayStr } from "@/lib/roles";
import { mondayStr } from "@/lib/teacher-reminders";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  fetchSummariesForParent,
  generateMonthlySummary,
  generateWeeklySummary,
  shareSummary,
  type PeriodSummary,
  type SummaryTable,
} from "@/lib/period-summaries";

type PeriodKind = "weekly" | "monthly";

export default function PeriodSummariesSection({
  schoolId,
  mode,
}: {
  schoolId: string;
  mode: "admin" | "parent";
}) {
  const { profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [periodKind, setPeriodKind] = useState<PeriodKind>("weekly");
  const [periodStart, setPeriodStart] = useState(mondayStr());
  const [preview, setPreview] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedTable, setSavedTable] = useState<SummaryTable | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<{ weekly: PeriodSummary[]; monthly: PeriodSummary[] }>({
    weekly: [],
    monthly: [],
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mode !== "admin" || !schoolId) return;
    (async () => {
      const { data: s } = await supabase
        .from("students")
        .select("*")
        .eq("school_id", schoolId)
        .order("last_name");
      setStudents((s as Student[] | null) ?? []);
      setLoaded(true);
    })();
  }, [mode, schoolId]);

  useEffect(() => {
    if (mode !== "parent" || !profile?.parent_id) return;
    (async () => {
      setShared(await fetchSummariesForParent(profile.parent_id as string));
      setLoaded(true);
    })();
  }, [mode, profile?.parent_id]);

  // Keep the date input on a Monday for weekly, first of the month for monthly.
  const onPeriodKind = (kind: PeriodKind) => {
    setPeriodKind(kind);
    setPreview("");
    setSavedId(null);
    if (kind === "weekly") setPeriodStart(mondayStr());
    else setPeriodStart(`${todayStr().slice(0, 8)}01`);
  };

  const generate = async () => {
    if (!studentId) {
      setMsg("Pick a pupil first.");
      return;
    }
    setBusy(true);
    setMsg("");
    const result =
      periodKind === "weekly"
        ? await generateWeeklySummary(studentId, periodStart)
        : await generateMonthlySummary(studentId, periodStart);
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error ?? "Could not generate the summary.");
      return;
    }
    setPreview(result.text);
    setSavedId(result.id);
    setSavedTable(periodKind === "weekly" ? "weekly_summaries" : "monthly_summaries");
    setMsg("Summary saved as a draft. Review it below, then share it with the parent when ready.");
  };

  const share = async () => {
    if (!savedId || !savedTable) return;
    setBusy(true);
    const result = await shareSummary(savedTable, savedId);
    setBusy(false);
    setMsg(
      result.ok
        ? "Summary shared - the parent can now see it in their workspace."
        : (result.error ?? "Could not share the summary."),
    );
    if (result.ok) {
      setSavedId(null);
      setSavedTable(null);
    }
  };

  const pupilName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  if (!schoolId) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Assessment Reports" sub="Weekly and monthly reports to parents." />
        <Card><p className="text-sm text-slate-500">Sign in to view assessment reports.</p></Card>
      </div>
    );
  }

  if (mode === "parent") {
    const total = shared.weekly.length + shared.monthly.length;
    return (
      <div>
        <ConfigBanner />
        <PageHeader
          title="Assessment Reports"
          sub="Weekly and monthly reports the school has shared for your children."
        />
        {!loaded ? (
          <Card><p className="text-sm text-slate-500">Loading…</p></Card>
        ) : total === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              No reports shared yet. When the school shares a weekly or monthly report for your child, it will show up here.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {shared.weekly.length > 0 && (
              <Card>
                <h2 className="mb-3 font-semibold">Weekly reports ({shared.weekly.length})</h2>
                <ul className="space-y-3 text-sm">
                  {shared.weekly.map((s) => (
                    <li key={s.id} className="rounded-lg bg-mist px-3 py-2">
                      <strong>{s.student_name}</strong>
                      <span className="text-slate-500"> · Week starting {new Date(`${s.period_start}T12:00:00`).toLocaleDateString()}</span>
                      <p className="mt-1 whitespace-pre-line text-slate-700">{s.summary_text}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {shared.monthly.length > 0 && (
              <Card>
                <h2 className="mb-3 font-semibold">Monthly reports ({shared.monthly.length})</h2>
                <ul className="space-y-3 text-sm">
                  {shared.monthly.map((s) => (
                    <li key={s.id} className="rounded-lg bg-mist px-3 py-2">
                      <strong>{s.student_name}</strong>
                      <span className="text-slate-500"> · {new Date(`${s.period_start}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
                      <p className="mt-1 whitespace-pre-line text-slate-700">{s.summary_text}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Assessment Reports"
        sub="Weekly and monthly reports to parents, worked out from live attendance, scores and domain assessments."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Generate a report</h2>
          {!loaded ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-slate-500">No pupils yet - the school admin adds them first in Students.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                generate();
              }}
              className="space-y-3"
            >
              <div>
                <label className={labelCls}>Pupil</label>
                <select className={inputCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">- Pick a pupil -</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.admission_no})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Report type</label>
                <select
                  className={inputCls}
                  value={periodKind}
                  onChange={(e) => onPeriodKind(e.target.value as PeriodKind)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  {periodKind === "weekly" ? "Week starting (Monday)" : "Month (first day)"}
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <button className={btnCls} disabled={busy || !studentId}>
                {busy ? "Generating…" : "Generate and save as draft"}
              </button>
            </form>
          )}
          {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Preview</h2>
          {preview ? (
            <>
              <p className="whitespace-pre-line text-sm text-slate-700">{preview}</p>
              <p className="mt-2 text-xs text-slate-500">
                Saved as a draft for {pupilName(studentId)} - only you can see it until you share it.
              </p>
              <button className={`${btnCls} mt-3`} onClick={share} disabled={busy || !savedId}>
                {busy ? "Sharing…" : "Share with parent"}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Pick a pupil and a week or month, then generate. The summary is worked out from the
              pupil&apos;s attendance, scores and domain assessments in that period, with a strengths
              line and a weaknesses line.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
