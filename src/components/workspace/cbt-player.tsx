"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { gradeFor } from "@/components/report-card";
import { btnCls, Card, inputCls } from "@/components/ui";

type Test = {
  id: string;
  title: string;
  subject_id: string | null;
  time_limit_minutes: number | null;
  due_date: string | null;
};

type Question = {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  marks: number;
};

type Attempt = {
  id: string;
  test_id: string;
  score: number | null;
  total: number | null;
  percentage: number | null;
  grade: string | null;
  submitted_at: string;
};

/** CBT practice mode (cbt_tests / cbt_questions / cbt_attempts).
 *  Practice only: timed, auto-marked, retakes allowed, and a practice
 *  attempt never counts as a grade — counted_as stays empty unless a
 *  teacher later counts a graded test into Scores. */
export default function CbtPlayer({
  schoolId,
  studentId,
  classId,
  subjectNames,
}: {
  schoolId: string;
  studentId: string;
  classId: string | null;
  subjectNames: Record<string, string>;
}) {
  const [tests, setTests] = useState<Test[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [active, setActive] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<{ score: number; total: number; pct: number } | null>(null);
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!classId) return;
    const { data: t } = await supabase
      .from("cbt_tests")
      .select("*")
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("mode", "Practice")
      .eq("status", "Published")
      .order("created_at", { ascending: false });
    setTests((t as Test[] | null) ?? []);
    const ids = ((t as Test[] | null) ?? []).map((x) => x.id);
    if (ids.length > 0) {
      const { data: a } = await supabase
        .from("cbt_attempts")
        .select("*")
        .eq("student_id", studentId)
        .in("test_id", ids)
        .order("submitted_at", { ascending: false });
      setAttempts((a as Attempt[] | null) ?? []);
    } else {
      setAttempts([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, studentId, classId]);

  // Countdown — auto-submits at zero.
  useEffect(() => {
    if (secondsLeft === null || !active) return;
    if (secondsLeft <= 0) {
      submit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, active]);

  const start = async (test: Test) => {
    const { data: qs } = await supabase
      .from("cbt_questions")
      .select("*")
      .eq("test_id", test.id)
      .order("created_at");
    const list = ((qs as Question[] | null) ?? []).map((q) => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : [],
    }));
    if (list.length === 0) {
      setMsg("This practice test has no questions yet — ask your teacher.");
      return;
    }
    setActive(test);
    setQuestions(list);
    setAnswers({});
    setResult(null);
    setMsg("");
    setSecondsLeft(test.time_limit_minutes ? test.time_limit_minutes * 60 : null);
  };

  const submit = async () => {
    if (!active) return;
    let score = 0;
    let total = 0;
    questions.forEach((q, i) => {
      total += q.marks;
      if (answers[i] === q.correct_index) score += q.marks;
    });
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const { error } = await supabase.from("cbt_attempts").insert({
      test_id: active.id,
      student_id: studentId,
      answers: questions.map((_, i) => answers[i] ?? null),
      score,
      total,
      percentage: pct,
      grade: gradeFor(pct),
      counted_as: null,
    });
    if (error) {
      setMsg(`Could not save your attempt: ${error.message}`);
      return;
    }
    setResult({ score, total, pct });
    setActive(null);
    setSecondsLeft(null);
    load();
  };

  const bestFor = (testId: string) => {
    const list = attempts.filter((a) => a.test_id === testId);
    if (list.length === 0) return null;
    return list.reduce((b, a) => ((a.percentage ?? 0) > (b.percentage ?? 0) ? a : b));
  };

  if (!classId) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          No class assigned yet, so there are no practice tests to show.
        </p>
      </Card>
    );
  }

  if (active) {
    const mm = secondsLeft === null ? null : Math.floor(secondsLeft / 60);
    const ss = secondsLeft === null ? null : String(secondsLeft % 60).padStart(2, "0");
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{active.title}</h2>
          <span className="text-sm font-bold text-royal">
            {secondsLeft === null ? "No time limit" : `⏱ ${mm}:${ss} left`}
          </span>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Practice mode — this score does not count as a grade. You can retake it as many times as you like.
        </p>
        <ol className="space-y-4">
          {questions.map((q, i) => (
            <li key={q.id}>
              <p className="text-sm font-medium">{i + 1}. {q.question} <span className="text-xs text-slate-400">({q.marks} mark{q.marks === 1 ? "" : "s"})</span></p>
              <div className="mt-2 space-y-1">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-mist">
                    <input
                      type="radio"
                      name={`q-${i}`}
                      checked={answers[i] === oi}
                      onChange={() => setAnswers({ ...answers, [i]: oi })}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <button className={`${btnCls} mt-4`} onClick={submit}>Submit answers</button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">CBT Practice</h2>
      <p className="mb-3 text-sm text-slate-500">
        Timed, auto-marked practice. Retakes allowed — practice never counts as a grade.
      </p>
      {msg && <p className="mb-3 text-sm font-medium text-royal">{msg}</p>}
      {result && (
        <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
          Your score: {result.score} / {result.total} ({result.pct}% — grade {gradeFor(result.pct)}). Well done — try again to beat it.
        </p>
      )}
      {tests.length === 0 ? (
        <p className="text-sm text-slate-500">
          No practice tests published for your class yet. Your teacher publishes them here when they are ready.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {tests.map((t) => {
            const best = bestFor(t.id);
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
                <span>
                  <strong>{t.title}</strong>
                  <span className="block text-xs text-slate-500">
                    {t.subject_id ? subjectNames[t.subject_id] ?? "" : ""} ·{" "}
                    {t.time_limit_minutes ? `${t.time_limit_minutes} minutes` : "No time limit"}
                    {t.due_date ? ` · Due ${t.due_date}` : ""}
                    {best ? ` · Best so far: ${best.percentage}% (${best.grade ?? "—"})` : ""}
                  </span>
                </span>
                <button className={btnCls} onClick={() => start(t)}>Start</button>
              </li>
            );
          })}
        </ul>
      )}
      {attempts.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">My attempts</h3>
          <ul className="space-y-1 text-sm text-slate-600">
            {attempts.slice(0, 8).map((a) => (
              <li key={a.id}>
                {tests.find((t) => t.id === a.test_id)?.title ?? "Test"} — {a.score}/{a.total} ({a.percentage}%, {a.grade ?? "—"}) · {new Date(a.submitted_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
