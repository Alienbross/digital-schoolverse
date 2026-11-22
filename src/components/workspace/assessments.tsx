// Affective & psychomotor assessment entry (migration 0012).
// Used by teachers (their own classes only - the classes passed in
// are already scoped) and by the school admin (any class). Cognitive
// scores are shown read-only from score_records - this screen never
// writes a Test / Assignment / Exam score.
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ClassRow, Student, Term } from "@/lib/types";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";
import { gradeFor } from "@/components/report-card";
import {
  DOMAIN_LABELS,
  loadDomainRatings,
  loadTraits,
  RATING_LABELS,
  type AssessmentTrait,
  type Domain,
  type DomainRatings,
} from "@/lib/assessments";

const DOMAINS: Domain[] = ["affective", "psychomotor"];

function RatingSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <select
      className={inputCls + " w-36"}
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">- Not rated -</option>
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n} - {RATING_LABELS[n]}
        </option>
      ))}
    </select>
  );
}

/** Read-only view of one pupil's saved domain ratings, for report
 *  cards, the student profile and the parent view. */
export function DomainRatingsView({
  ratings,
}: {
  ratings: { affective: DomainRatings; psychomotor: DomainRatings } | null;
}) {
  if (!ratings) return <p className="text-sm text-slate-500">Loading assessments…</p>;
  return (
    <div className="space-y-4">
      {DOMAINS.map((domain) => {
        const d = ratings[domain];
        return (
          <div key={domain}>
            <h3 className="mb-2 font-semibold">
              {DOMAIN_LABELS[domain]}
              {d.average !== null ? ` - average ${d.average.toFixed(1)} / 5` : ""}
            </h3>
            {d.items.length === 0 ? (
              <p className="text-sm text-slate-500">No {domain === "affective" ? "affective" : "psychomotor"} ratings entered for this term yet.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-mist text-left">
                    <th className="border border-line px-2 py-2">Trait / skill</th>
                    <th className="border border-line px-2 py-2">Rating /5</th>
                    <th className="border border-line px-2 py-2">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((it) => (
                    <tr key={it.traitId}>
                      <td className="border border-line px-2 py-2 font-medium">{it.traitName}</td>
                      <td className="border border-line px-2 py-2 font-semibold">{it.rating}</td>
                      <td className="border border-line px-2 py-2">{RATING_LABELS[it.rating] ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.comment && (
              <p className="mt-2 text-sm text-slate-600">
                <strong>Comment:</strong> {d.comment}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AssessmentEntry({
  schoolId,
  classes,
  pupilsOf,
  term,
}: {
  schoolId: string;
  classes: ClassRow[];
  pupilsOf: (classId: string) => Student[];
  term: Term | null;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [studentId, setStudentId] = useState("");
  const [traits, setTraits] = useState<AssessmentTrait[]>([]);
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [comments, setComments] = useState<Record<Domain, string>>({ affective: "", psychomotor: "" });
  const [cognitive, setCognitive] = useState<{ subject: string; total: number; grade: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const pupils = pupilsOf(classId);
  const pupil = pupils.find((p) => p.id === studentId);

  useEffect(() => {
    if (classes.length > 0 && !classId) setClassId(classes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes]);
  useEffect(() => {
    if (pupils.length > 0 && !studentId) setStudentId(pupils[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pupils]);

  // Traits + this pupil's saved ratings, comments and cognitive scores.
  useEffect(() => {
    if (!schoolId || !term || !studentId) return;
    (async () => {
      const list = await loadTraits(schoolId);
      setTraits(list);
      const saved = await loadDomainRatings(schoolId, studentId, term.id);
      const map: Record<string, number | null> = {};
      for (const d of [saved.affective, saved.psychomotor]) {
        for (const it of d.items) map[it.traitId] = it.rating;
      }
      setRatings(map);
      setComments({
        affective: saved.affective.comment ?? "",
        psychomotor: saved.psychomotor.comment ?? "",
      });
      const { data: sc } = await supabase
        .from("score_records")
        .select("test_score, assignment_score, exam_score, subjects(name)")
        .eq("student_id", studentId)
        .eq("term_id", term.id);
      setCognitive(
        ((sc as { test_score: number | null; assignment_score: number | null; exam_score: number | null; subjects: { name: string } | null }[] | null) ?? []).map((r) => {
          const total = (r.test_score ?? 0) + (r.assignment_score ?? 0) + (r.exam_score ?? 0);
          return { subject: r.subjects?.name ?? "-", total, grade: gradeFor(total) };
        }).sort((a, b) => a.subject.localeCompare(b.subject)),
      );
    })();
  }, [schoolId, term, studentId]);

  const traitsOf = (domain: Domain) => traits.filter((t) => t.domain === domain);
  const ratedCount = (domain: Domain) =>
    traitsOf(domain).filter((t) => ratings[t.id] !== null && ratings[t.id] !== undefined).length;

  const save = async () => {
    if (!term || !pupil) return;
    setSaving(true);
    setMsg("");
    const payload = traits
      .filter((t) => ratings[t.id] !== null && ratings[t.id] !== undefined)
      .map((t) => ({
        school_id: schoolId,
        student_id: pupil.id,
        class_id: classId,
        term_id: term.id,
        trait_id: t.id,
        domain: t.domain,
        trait_name: t.name,
        rating: ratings[t.id] as number,
      }));
    // Ratings cleared back to "Not rated" are removed.
    const ratedIds = new Set(payload.map((p) => p.trait_id));
    const { error: delErr } = await supabase
      .from("domain_assessments")
      .delete()
      .eq("student_id", pupil.id)
      .eq("term_id", term.id)
      .not("trait_id", "in", `(${[...ratedIds].join(",") || "00000000-0000-0000-0000-000000000000"})`);
    let error = delErr;
    if (!error && payload.length > 0) {
      const { error: upErr } = await supabase
        .from("domain_assessments")
        .upsert(payload, { onConflict: "student_id,term_id,trait_id" });
      error = upErr;
    }
    // One comment per domain; an emptied comment is removed.
    if (!error) {
      for (const domain of DOMAINS) {
        const text = comments[domain].trim();
        if (text === "") {
          await supabase
            .from("domain_assessment_comments")
            .delete()
            .eq("student_id", pupil.id)
            .eq("term_id", term.id)
            .eq("domain", domain);
        } else {
          const { error: cErr } = await supabase
            .from("domain_assessment_comments")
            .upsert(
              {
                school_id: schoolId,
                student_id: pupil.id,
                term_id: term.id,
                domain,
                comment: text,
              },
              { onConflict: "student_id,term_id,domain" },
            );
          if (cErr) { error = cErr; break; }
        }
      }
    }
    setSaving(false);
    setMsg(
      error
        ? `Could not save assessments: ${error.message}`
        : `Saved ${payload.length} rating(s) for ${pupil.first_name} ${pupil.last_name}. Saving again updates them in place.`,
    );
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-3">
        <div>
          <label className={labelCls}>Class</label>
          <select className={inputCls} value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Pupil</label>
          <select className={inputCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {pupils.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button className={btnCls} disabled={saving || !term || !pupil} onClick={() => void save()}>
            {saving ? "Saving…" : "Save assessments"}
          </button>
        </div>
      </div>
      {term ? (
        <p className="mb-3 text-xs text-slate-500">
          Term: {term.session} - {term.name} · Ratings are 1 - Poor, 2 - Fair, 3 - Good, 4 - Very Good, 5 - Excellent.
        </p>
      ) : (
        <p className="mb-3 text-xs text-amber-700">No current term is set - assessments need a current term. Ask the school admin to mark one current in School Setup.</p>
      )}
      {msg && <p className="mb-3 text-sm font-medium text-royal">{msg}</p>}
      {pupils.length === 0 ? (
        <p className="text-sm text-slate-500">No pupils in this class yet.</p>
      ) : !pupil ? (
        <p className="text-sm text-slate-500">Pick a pupil to assess.</p>
      ) : (
        <div className="space-y-5">
          {/* Cognitive - read-only link to the scores already saved. */}
          <div>
            <h3 className="mb-2 font-semibold">Cognitive - from saved scores (read-only here)</h3>
            {cognitive.length === 0 ? (
              <p className="text-sm text-slate-500">No subject scores saved for {pupil.first_name} this term yet - enter them in Scores &amp; Results first.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {cognitive.map((c) => (
                  <li key={c.subject} className="flex justify-between rounded-lg bg-mist px-3 py-1.5">
                    <span><strong>{c.subject}</strong></span>
                    <span>{c.total}/100 ({c.grade})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {DOMAINS.map((domain) => (
            <div key={domain}>
              <h3 className="mb-2 font-semibold">
                {DOMAIN_LABELS[domain]} - rated {ratedCount(domain)} of {traitsOf(domain).length}
              </h3>
              {traitsOf(domain).length === 0 ? (
                <p className="text-sm text-slate-500">No {domain} traits set up yet - the school admin adds them in School Setup.</p>
              ) : (
                <div className="space-y-2">
                  {traitsOf(domain).map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2 text-sm">
                      <span className="font-medium">{t.name}</span>
                      <RatingSelect value={ratings[t.id] ?? null} onChange={(v) => setRatings({ ...ratings, [t.id]: v })} />
                    </div>
                  ))}
                  <div>
                    <label className={labelCls}>{domain === "affective" ? "Affective" : "Psychomotor"} comment (optional)</label>
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={comments[domain]}
                      onChange={(e) => setComments({ ...comments, [domain]: e.target.value })}
                      placeholder="A short note about this pupil this term…"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Ratings never change a grade, an attendance mark or a fee. They show on the pupil&apos;s report card, profile and parent view once saved.
          </p>
        </div>
      )}
    </Card>
  );
}

/** Admin editor for the trait / skill lists, in School Setup. */
export function TraitEditor({ schoolId, readOnly }: { schoolId: string; readOnly: boolean }) {
  const [traits, setTraits] = useState<AssessmentTrait[]>([]);
  const [newName, setNewName] = useState<Record<Domain, string>>({ affective: "", psychomotor: "" });
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!schoolId) return;
    setTraits(await loadTraits(schoolId));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId]);

  const add = async (domain: Domain) => {
    const name = newName[domain].trim();
    if (!name) return;
    const maxOrder = traits.filter((t) => t.domain === domain).reduce((m, t) => Math.max(m, t.sort_order), 0);
    const { error } = await supabase
      .from("assessment_traits")
      .insert({ school_id: schoolId, domain, name, sort_order: maxOrder + 1 });
    setMsg(error ? `Could not add it: ${error.message}` : `Added "${name}".`);
    if (!error) { setNewName({ ...newName, [domain]: "" }); await load(); }
  };

  const rename = async (t: AssessmentTrait, name: string) => {
    const clean = name.trim();
    if (!clean || clean === t.name) { await load(); return; }
    const { error } = await supabase
      .from("assessment_traits")
      .update({ name: clean })
      .eq("id", t.id);
    setMsg(error ? `Could not rename it: ${error.message}` : `Renamed to "${clean}". Ratings already saved keep the old name.`);
    if (!error) await load();
  };

  const remove = async (t: AssessmentTrait) => {
    const { error } = await supabase
      .from("assessment_traits")
      .update({ is_active: false })
      .eq("id", t.id);
    setMsg(error ? `Could not remove it: ${error.message}` : `Removed "${t.name}" from future entry. Ratings already saved stay on past report cards.`);
    if (!error) await load();
  };

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        The traits and skills teachers rate each pupil on, 1 to 5, each term.
        Removing one hides it from future entry only - ratings already saved
        stay on past report cards.
      </p>
      {msg && <p className="mb-3 text-sm font-medium text-royal">{msg}</p>}
      {DOMAINS.map((domain) => (
        <div key={domain} className="mb-4">
          <h3 className="mb-2 font-semibold">{DOMAIN_LABELS[domain]}</h3>
          <ul className="space-y-2 text-sm">
            {traits.filter((t) => t.domain === domain).map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <input
                  className={inputCls + " flex-1"}
                  defaultValue={t.name}
                  disabled={readOnly}
                  onBlur={(e) => void rename(t, e.target.value)}
                />
                <button
                  type="button"
                  className="text-sm font-semibold text-red-700"
                  disabled={readOnly}
                  onClick={() => void remove(t)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {!readOnly && (
            <div className="mt-2 flex gap-2">
              <input
                className={inputCls + " flex-1"}
                value={newName[domain]}
                onChange={(e) => setNewName({ ...newName, [domain]: e.target.value })}
                placeholder={`Add a ${domain === "affective" ? "trait" : "skill"}…`}
              />
              <button type="button" className={btnCls} onClick={() => void add(domain)}>Add</button>
            </div>
          )}
        </div>
      ))}
      {traits.length === 0 && (
        <p className="text-sm text-slate-500">The default lists load automatically the first time this page opens.</p>
      )}
      <p className="text-xs text-slate-500">
        Defaults: Affective - {["Punctuality", "Neatness", "Honesty", "Obedience", "Attentiveness", "Cooperation", "Leadership"].join(", ")}.
        Psychomotor - {["Handwriting", "Drawing", "Craftwork", "Sports and Games", "ICT and Computer Use", "Practical Skills"].join(", ")}.
      </p>
    </div>
  );
}

export type { DomainRatings };
