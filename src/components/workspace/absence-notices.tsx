"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AbsenceEmailRow } from "@/lib/types";
import { ABSENCE_EMAIL_QUEUED, ABSENCE_EMAIL_UNREACHABLE } from "@/lib/absence-emails";
import { todayStr } from "@/lib/roles";
import { Card, inputCls, labelCls } from "@/components/ui";

/**
 * Absence notices log (migration 0008).
 *
 * Staff mode (admin / teacher): one row per parent notice for the
 * day - pupil, parent name + email, kind (Absent / Late), reason,
 * status. "Unreachable - no email on record" flags parents with no
 * email on file instead of silently skipping them.
 *
 * Parent mode: the parent's own notices only - pupil, date, kind,
 * reason and the full email text as it will be sent once a live
 * provider is connected. Nothing here claims a real email was sent:
 * every Queued row says so plainly.
 */
export default function AbsenceNoticesLog({
  schoolId,
  classId,
  parentId,
  date,
  mode,
  title,
  showDatePicker,
  refreshKey,
}: {
  schoolId: string;
  classId?: string;
  parentId?: string;
  /** Day to show. Omit for the parent view (shows the latest 20). */
  date?: string;
  mode: "staff" | "parent";
  title: string;
  showDatePicker?: boolean;
  /** Bump after a register save to reload the log. */
  refreshKey?: number;
}) {
  // The day shown: the register date passed in (teacher / admin
  // log for one day), or the date picked in the component (admin
  // overview). No date prop means all dates (parent view).
  const [pickedDay, setPickedDay] = useState(date ?? todayStr());
  const day = date ?? pickedDay;
  const [rows, setRows] = useState<AbsenceEmailRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- same data-loading pattern as the rest of this codebase */
  useEffect(() => {
    if (!schoolId) return;
    setLoaded(false);
    (async () => {
      let q = supabase
        .from("absence_emails")
        .select("*")
        .eq("school_id", schoolId)
        .order("record_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (date) q = q.eq("record_date", day);
      if (classId) q = q.eq("class_id", classId);
      if (parentId) q = q.eq("parent_id", parentId);
      const { data } = await q;
      setRows((data as AbsenceEmailRow[] | null) ?? []);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, classId, parentId, day, refreshKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const statusCls = (status: string) =>
    status === "Sent"
      ? "bg-green-100 text-green-700"
      : status === ABSENCE_EMAIL_UNREACHABLE
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-800";

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {showDatePicker && (
          <div className="flex items-center gap-2">
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={day} onChange={(e) => setPickedDay(e.target.value)} />
          </div>
        )}
      </div>
      {mode === "parent" ? (
        <p className="mb-3 text-sm text-slate-500">
          When your child is marked absent or late, the school queues an
          email to you here. No email has been sent yet - no live email
          provider is connected - so the notice is shown here in the
          portal instead.
        </p>
      ) : (
        <p className="mb-3 text-sm text-slate-500">
          Queued - no live email provider is connected yet, so no real
          email has been sent. These notices are shown to parents in the
          portal instead, and will be sent for real once an email
          provider is connected.
        </p>
      )}
      {!loaded ? (
        <p className="text-sm text-slate-500">Loading notices…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {mode === "parent"
            ? "No absence notices for your children yet."
            : "No absence notices for this day yet - they appear here when a register is saved with a pupil marked Absent or Late."}
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg bg-mist px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{r.pupil_name}</strong>
                  {mode === "staff" && (
                    <span className="text-slate-500">
                      {" "}· parent: {r.parent_name}
                      {r.parent_email ? ` (${r.parent_email})` : " (no email on record)"}
                    </span>
                  )}
                  <span className="text-slate-500"> · {r.record_date}</span>
                </span>
                <span className="flex gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.kind === "Absent" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                    {r.kind}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls(r.status)}`}>
                    {r.status === ABSENCE_EMAIL_QUEUED ? "Queued - not sent yet" : r.status}
                  </span>
                </span>
              </div>
              {r.reason?.trim() && <p className="mt-1 text-slate-600">Reason: {r.reason}</p>}
              {mode === "parent" && (
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{r.body}</p>
              )}
              {mode === "staff" && r.status === ABSENCE_EMAIL_UNREACHABLE && (
                <p className="mt-1 text-red-700">
                  No email address on record for this parent - add one under Parents so the notice can be sent.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
