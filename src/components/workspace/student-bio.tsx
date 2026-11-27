"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, ConfigBanner, PageHeader, btnCls, inputCls, labelCls } from "@/components/ui";
import {
  fetchStudentBio,
  saveStudentBio,
  type StudentBio,
  type StudentBioFields,
} from "@/lib/student-bio";

/** Read-only bio rows (club, interest, sport, ambition, favourite
 *  colour, class teacher) for showing a pupil's bio to someone else
 *  - the linked parent on My Children and on the pupil's profile
 *  page. The bio is the pupil's own data shared with their parent,
 *  so it is NOT gated behind the profile-share step. */
export function BioFieldsList({
  bio,
  classTeacherName,
}: {
  bio: StudentBioFields | null;
  classTeacherName: string | null;
}) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Club", value: bio?.club ?? null },
    { label: "Interest", value: bio?.interest ?? null },
    { label: "Sport", value: bio?.sport ?? null },
    { label: "Ambition", value: bio?.ambition ?? null },
    { label: "Favourite colour", value: bio?.favourite_colour ?? null },
  ];
  const filled = rows.some((r) => r.value);
  return (
    <div className="text-sm">
      <p className="mb-2">
        <strong>Class teacher:</strong> {classTeacherName ?? "Not assigned yet"}
      </p>
      {filled ? (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label}>
              <strong>{r.label}:</strong> {r.value ?? "Not filled in yet"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500">No bio filled in yet.</p>
      )}
    </div>
  );
}

/** Student bio (migration 0023).
 *
 *  Edit mode (the pupil themself): a form with Club, Interest,
 *  Sport, Ambition and Favourite colour, plus the class teacher's
 *  name shown read-only - the class teacher is never edited here.
 *  View mode (parent / admin): the same fields read-only, plus the
 *  class teacher's name. */
export default function StudentBioSection({
  schoolId,
  studentId,
  mode,
}: {
  schoolId: string;
  studentId: string;
  mode: "edit" | "view";
}) {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<StudentBio | null>(null);
  const [state, setState] = useState("loading");
  const [fields, setFields] = useState<StudentBioFields>({
    club: "",
    interest: "",
    sport: "",
    ambition: "",
    favourite_colour: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const isOwnBio = profile?.student_id === studentId;

  useEffect(() => {
    if (authLoading || !schoolId || !studentId) return;
    (async () => {
      const d = await fetchStudentBio(studentId);
      if (!d.studentName) {
        setState("not-found");
        return;
      }
      setData(d);
      setFields({
        club: d.bio?.club ?? "",
        interest: d.bio?.interest ?? "",
        sport: d.bio?.sport ?? "",
        ambition: d.bio?.ambition ?? "",
        favourite_colour: d.bio?.favourite_colour ?? "",
      });
      setState("ready");
    })();
  }, [authLoading, schoolId, studentId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await saveStudentBio(studentId, fields);
    if (!res.ok) {
      setMsg(`Could not save: ${res.error ?? "unknown error"}`);
    } else {
      setMsg("Bio saved.");
    }
    setSaving(false);
  };

  if (state === "loading") {
    return (
      <div>
        <ConfigBanner />
        <p className="text-sm text-slate-500">Loading bio…</p>
      </div>
    );
  }

  if (state === "not-found" || !data) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Student bio" sub="No pupil with that record was found." />
      </div>
    );
  }

  if (mode === "edit" && !isOwnBio) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader
          title="My bio"
          sub="You can only edit your own bio - this bio belongs to another pupil."
        />
      </div>
    );
  }

  const title = mode === "edit" ? "My bio" : `Bio - ${data.studentName}`;
  const sub =
    mode === "edit"
      ? "Tell the school a little about you - your club, interests, sport, ambition and favourite colour. Your class teacher is shown below and cannot be changed here."
      : `${data.studentName}${data.className ? ` · ${data.className}` : ""} - club, interests, sport, ambition and favourite colour, as filled in by the pupil.`;

  const rows: { label: string; value: string | null }[] = [
    { label: "Club", value: fields.club || null },
    { label: "Interest", value: fields.interest || null },
    { label: "Sport", value: fields.sport || null },
    { label: "Ambition", value: fields.ambition || null },
    { label: "Favourite colour", value: fields.favourite_colour || null },
  ];

  return (
    <div>
      <ConfigBanner />
      <PageHeader title={title} sub={sub} />
      <Card>
        <p className="mb-3 text-sm">
          <strong>Class teacher:</strong>{" "}
          {data.classTeacherName ?? "Not assigned yet"}
        </p>
        {mode === "edit" ? (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className={labelCls}>Club</label>
              <input
                className={inputCls}
                value={fields.club ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, club: e.target.value }))}
                placeholder="e.g. Chess club"
              />
            </div>
            <div>
              <label className={labelCls}>Interest</label>
              <input
                className={inputCls}
                value={fields.interest ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, interest: e.target.value }))}
                placeholder="e.g. Reading, drawing"
              />
            </div>
            <div>
              <label className={labelCls}>Sport</label>
              <input
                className={inputCls}
                value={fields.sport ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, sport: e.target.value }))}
                placeholder="e.g. Football"
              />
            </div>
            <div>
              <label className={labelCls}>Ambition</label>
              <input
                className={inputCls}
                value={fields.ambition ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, ambition: e.target.value }))}
                placeholder="e.g. To become a doctor"
              />
            </div>
            <div>
              <label className={labelCls}>Favourite colour</label>
              <input
                className={inputCls}
                value={fields.favourite_colour ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, favourite_colour: e.target.value }))}
                placeholder="e.g. Blue"
              />
            </div>
            <button className={btnCls} disabled={saving}>
              {saving ? "Saving…" : "Save bio"}
            </button>
          </form>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.label}>
                <strong>{r.label}:</strong> {r.value ?? "Not filled in yet"}
              </li>
            ))}
          </ul>
        )}
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
    </div>
  );
}
