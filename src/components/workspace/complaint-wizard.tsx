"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  COMPLAINT_CATEGORIES,
  nextComplaintRef,
  type ComplaintCategory,
} from "@/lib/roles";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";

const STEPS = ["What happened", "When & where", "Details", "Contact & priority", "Review & send"];

/** Guided 5-step complaint / query wizard (complaints table, source
 *  "Online form"). Step 1 picks the category — choosing Bullying
 *  takes the urgent route: priority is forced to Urgent and the
 *  reporter is told a senior staff member is alerted straight away. */
export default function ComplaintWizard({
  schoolId,
  raisedBy,
  reporterName,
  studentOptions,
  studentLabels,
  defaultStudentId,
  onSubmitted,
}: {
  schoolId: string;
  raisedBy: "Parent" | "Student" | "Teacher";
  reporterName: string;
  /** Pupils this complaint can be about. */
  studentOptions: string[];
  studentLabels: Record<string, string>;
  defaultStudentId?: string | null;
  onSubmitted?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<ComplaintCategory>("Other");
  const [subject, setSubject] = useState("");
  const [studentId, setStudentId] = useState(defaultStudentId ?? "");
  const [when, setWhen] = useState("");
  const [where, setWhere] = useState("");
  const [who, setWho] = useState("");
  const [details, setDetails] = useState("");
  const [outcome, setOutcome] = useState("");
  const [contact, setContact] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [msg, setMsg] = useState("");
  const [doneRef, setDoneRef] = useState<string | null>(null);

  const isBullying = category === "Bullying";
  const finalPriority = isBullying ? "Urgent" : priority;

  const canNext =
    step === 0
      ? subject.trim().length > 0
      : step === 1
        ? true
        : step === 2
          ? details.trim().length > 0
          : step === 3
            ? true
            : true;

  const submit = async () => {
    const ref = await nextComplaintRef(schoolId);
    const { error } = await supabase.from("complaints").insert({
      school_id: schoolId,
      student_id: studentId || null,
      reference: ref,
      raised_by: raisedBy,
      reporter_name: reporterName || null,
      reporter_contact: contact.trim() || null,
      category,
      priority: finalPriority,
      subject: subject.trim(),
      details: details.trim(),
      status: "Open",
      source: "Online form",
      guided_when: when.trim() || null,
      guided_where: where.trim() || null,
      guided_who: who.trim() || null,
      desired_outcome: outcome.trim() || null,
    });
    if (error) {
      setMsg(`Could not send: ${error.message}`);
      return;
    }
    setDoneRef(ref);
    setMsg("");
    onSubmitted?.();
  };

  if (doneRef) {
    return (
      <Card>
        <h2 className="font-semibold text-green-700">Sent — thank you.</h2>
        <p className="mt-2 text-sm">
          Your reference is <strong>{doneRef}</strong>. Keep it — you can
          quote it when you follow up with the school.
        </p>
        {isBullying && (
          <p className="mt-2 text-sm font-semibold text-red-700">
            This was raised as urgent (bullying). A senior staff member has
            been alerted and the school will follow up as a priority. If
            anyone is in immediate danger, tell a teacher or a trusted adult
            in person right away.
          </p>
        )}
        <button
          className={`${btnCls} mt-4`}
          onClick={() => {
            setDoneRef(null);
            setStep(0);
            setSubject("");
            setDetails("");
            setOutcome("");
          }}
        >
          Raise another
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-xs font-semibold text-slate-500">
        Step {step + 1} of 5 — {STEPS[step]}
      </p>
      <div className="mb-4 mt-2 flex gap-1">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-royal" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>What is this about?</label>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)}>
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {isBullying && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              Urgent route: bullying reports go straight to a senior staff
              member as Urgent. If anyone is in immediate danger, tell a
              teacher or a trusted adult in person right away.
            </p>
          )}
          <div>
            <label className={labelCls}>Short subject</label>
            <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. My child was hurt at break time" />
          </div>
          {studentOptions.length > 0 && (
            <div>
              <label className={labelCls}>About pupil</label>
              <select className={inputCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">— General (not about one pupil) —</option>
                {studentOptions.map((id) => (
                  <option key={id} value={id}>{studentLabels[id] ?? id}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <div><label className={labelCls}>When did it happen?</label><input className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="e.g. Tuesday break time" /></div>
          <div><label className={labelCls}>Where?</label><input className={inputCls} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Playground, classroom…" /></div>
          <div><label className={labelCls}>Who was involved?</label><input className={inputCls} value={who} onChange={(e) => setWho(e.target.value)} placeholder="Names, if you know them" /></div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div><label className={labelCls}>What happened, in your own words</label><textarea className={inputCls} rows={4} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
          <div><label className={labelCls}>What would you like to happen?</label><input className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. A teacher speaks to the class" /></div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div><label className={labelCls}>How can the school reach you?</label><input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" /></div>
          <div>
            <label className={labelCls}>Priority</label>
            <select className={inputCls} value={finalPriority} onChange={(e) => setPriority(e.target.value)} disabled={isBullying}>
              <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
            </select>
            {isBullying && <p className="mt-1 text-xs text-red-700">Bullying is always Urgent.</p>}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2 text-sm">
          <p><strong>Category:</strong> {category} · <strong>Priority:</strong> {finalPriority}</p>
          <p><strong>Subject:</strong> {subject}</p>
          {studentId && <p><strong>About:</strong> {studentLabels[studentId]}</p>}
          <p><strong>When / where / who:</strong> {[when, where, who].filter(Boolean).join(" · ") || "—"}</p>
          <p><strong>Details:</strong> {details}</p>
          <p><strong>Outcome wanted:</strong> {outcome || "—"}</p>
          <p><strong>Contact:</strong> {contact || "—"}</p>
        </div>
      )}

      {msg && <p className="mt-3 text-sm font-medium text-red-700">{msg}</p>}
      <div className="mt-4 flex gap-2">
        {step > 0 && (
          <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        )}
        {step < 4 ? (
          <button className={btnCls} disabled={!canNext} onClick={() => setStep(step + 1)}>
            Next →
          </button>
        ) : (
          <button className={btnCls} onClick={submit}>Send complaint</button>
        )}
      </div>
    </Card>
  );
}
