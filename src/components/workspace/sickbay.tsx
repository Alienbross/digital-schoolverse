// Sickbay and emergency alerts (migration 0024): record an event
// for a pupil and alert their linked parents in-portal.
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { ClassRow, Student } from "@/lib/types";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  fetchSickbayEvents,
  recordSickbayEvent,
  SICKBAY_KINDS,
  type SickbayEvent,
  type SickbayKind,
} from "@/lib/sickbay";

export default function SickbaySection({ schoolId }: { schoolId: string }) {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<SickbayEvent[]>([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<SickbayKind>("Sickbay");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("classes").select("*").eq("school_id", schoolId).order("name"),
      supabase.from("students").select("*").eq("school_id", schoolId).order("last_name"),
    ]);
    setClasses((c as ClassRow[] | null) ?? []);
    setStudents((s as Student[] | null) ?? []);
    setEvents(await fetchSickbayEvents(schoolId));
    setLoaded(true);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const pupilsOf = (id: string) => students.filter((s) => s.class_id === id);
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "-";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      setMsg("Pick a pupil first.");
      return;
    }
    setSaving(true);
    setMsg("");
    const result = await recordSickbayEvent({
      schoolId,
      studentId,
      kind,
      note: note || null,
      recordedBy: profile?.id ?? null,
    });
    setSaving(false);
    if (!result.ok) {
      setMsg(result.error ?? "Could not record the event.");
      return;
    }
    setMsg(
      result.notified > 0
        ? `Event recorded - ${result.notified} parent${result.notified === 1 ? "" : "s"} alerted in-portal${result.emailed > 0 ? ` and ${result.emailed} emailed` : ""}.`
        : result.emailed > 0
          ? `Event recorded - ${result.emailed} parent${result.emailed === 1 ? "" : "s"} emailed (no linked parent with a login to alert in-portal).`
          : "Event recorded - no linked parent with a login to alert in-portal.",
    );
    if (result.error) setMsg((m) => `${m} ${result.error}`);
    setNote("");
    load();
  };

  if (!schoolId) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Sickbay Alerts" sub="Sickbay visits, children sent home, and emergencies." />
        <Card><p className="text-sm text-slate-500">Sign in to record sickbay alerts.</p></Card>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Sickbay Alerts"
        sub="Record a sickbay visit, a child sent home, or an emergency - the pupil's linked parents are alerted in-portal and by email when live email is connected."
      />
      <p className="mb-4 text-xs text-slate-500">
        Parents are alerted in-portal, and by email when live email is connected (Resend). SMS is not connected yet - the SMS plug-in point is in src/lib/sickbay.ts (sendSickbaySms stub).
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Record an event</h2>
          {!loaded ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : classes.length === 0 ? (
            <p className="text-sm text-slate-500">No classes yet - the school admin creates them first in Classes &amp; Arms.</p>
          ) : (
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className={labelCls}>Class</label>
                <select
                  className={inputCls}
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setStudentId("");
                  }}
                >
                  <option value="">- Pick a class -</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Pupil</label>
                <select
                  className={inputCls}
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  disabled={!classId}
                >
                  <option value="">- Pick a pupil -</option>
                  {pupilsOf(classId).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.admission_no})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Kind</label>
                <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as SickbayKind)}>
                  {SICKBAY_KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Note (optional)</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Complained of a headache after lunch, resting in the sickbay."
                />
              </div>
              <button className={btnCls} disabled={saving || !studentId}>
                {saving ? "Recording…" : "Record event and alert parents"}
              </button>
            </form>
          )}
          {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Recent events ({events.length})</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">No sickbay events recorded yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="rounded-lg bg-mist px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${ev.kind === "Emergency" ? "bg-red-100 text-red-700" : ev.kind === "Sent home" ? "bg-amber-100 text-amber-700" : "bg-white text-royal"}`}>
                        {ev.kind}
                      </span>
                      <strong>{ev.student_name}</strong>
                      {ev.class_name ? <span className="text-slate-600"> · {ev.class_name}</span> : null}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(ev.recorded_at).toLocaleString()}
                    </span>
                  </div>
                  {ev.note && <p className="mt-1 text-slate-600">{ev.note}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Only the latest 50 events are shown. Parents see each alert in their own workspace.
          </p>
        </Card>
      </div>
    </div>
  );
}
