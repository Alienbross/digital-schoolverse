// Assignment reminders - school holidays (migration 0026).
// Admin view: the holiday list with add / delete, plus the rule
// that homework due dates and evening reminders skip Fridays,
// weekends and public holidays and shift to the next school day.
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  addSchoolHoliday,
  deleteSchoolHoliday,
  fetchSchoolHolidays,
  type SchoolHoliday,
} from "@/lib/homework-reminders";

export default function HomeworkRemindersSection({ schoolId }: { schoolId: string }) {
  const { profile } = useAuth();
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isAdmin = profile?.role === "school_admin" || profile?.role === "platform_owner";

  const load = async () => {
    if (!schoolId) return;
    setHolidays(await fetchSchoolHolidays(schoolId));
    setLoaded(true);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setMsg("Pick a date first.");
      return;
    }
    setBusy(true);
    const result = await addSchoolHoliday(schoolId, date, label || null);
    setBusy(false);
    setMsg(result.ok ? "Holiday added." : (result.error ?? "Could not add the holiday."));
    if (result.ok) {
      setDate("");
      setLabel("");
      load();
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    const result = await deleteSchoolHoliday(id);
    setBusy(false);
    setMsg(result.ok ? "Holiday removed." : (result.error ?? "Could not remove the holiday."));
    if (result.ok) load();
  };

  if (!schoolId) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Homework Reminders" sub="School holidays and the reminder rules." />
        <Card><p className="text-sm text-slate-500">Sign in to view homework reminders.</p></Card>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Homework Reminders"
        sub="When homework is given, pupils and parents are alerted in-portal. Evening reminders go out on school days only."
      />
      <Card>
        <h2 className="mb-2 font-semibold">The rule</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>When homework is given, each pupil in the class and each linked parent gets one in-portal alert.</li>
          <li>Evening reminders only go out on school days - never on Fridays, Saturdays or Sundays, and never on a public holiday.</li>
          <li>An evening reminder only goes to a pupil with 4 or more homework tasks due that day or given that day, and only once per pupil per day.</li>
          <li>Due dates and reminders that fall on a Friday, a weekend or a public holiday shift to the next school day.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          All reminders are in-portal only - no SMS or email is sent.
        </p>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {isAdmin && (
          <Card>
            <h2 className="mb-3 font-semibold">Add a holiday</h2>
            <form onSubmit={add} className="space-y-3">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Label (optional)</label>
                <input
                  className={inputCls}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Independence Day"
                />
              </div>
              <button className={btnCls} disabled={busy || !date}>
                {busy ? "Adding…" : "Add holiday"}
              </button>
            </form>
            {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
          </Card>
        )}
        <Card>
          <h2 className="mb-3 font-semibold">School holidays ({holidays.length})</h2>
          {!loaded ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-slate-500">
              No holidays set yet. Add public holidays and school closures so due dates and reminders skip them.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {holidays.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
                  <span>
                    <strong>{new Date(`${h.holiday_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</strong>
                    {h.label ? <span className="text-slate-600"> · {h.label}</span> : null}
                  </span>
                  {isAdmin && (
                    <button
                      className="text-xs font-semibold text-red-600"
                      onClick={() => remove(h.id)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isAdmin && msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
        </Card>
      </div>
    </div>
  );
}
