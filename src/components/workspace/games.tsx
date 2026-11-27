"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  AFFAIRS_BANK,
  GAME_MODE_LABELS,
  isWeekend,
  loadGameMode,
  loadPupilGameModes,
  makeNumberQuestions,
  pickAffairs,
  pickWords,
  pupilGamesOpen,
  saveGameMode,
  scramble,
  type GameMode,
} from "@/lib/games";

type GameTab = "numbers" | "words" | "affairs";

const GAME_TABS: { id: GameTab; label: string }[] = [
  { id: "numbers", label: "Numbers" },
  { id: "words", label: "Words" },
  { id: "affairs", label: "Current Affairs" },
];

/** Games are for pupils, parents and teachers. They open on
 *  Saturday and Sunday by default; a parent can open them for
 *  their own child on weekdays too, or block them even on
 *  weekends. The school admin and the platform owner do not play. */
export default function GamesContent() {
  const { schoolId, profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<GameTab>("numbers");
  const [open, setOpen] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");

  const role = profile?.role ?? "";
  const isStudent = role === "student";
  const isBlockedRole = role === "school_admin" || role === "platform_owner";
  const studentId = profile?.student_id ?? "";

  useEffect(() => {
    if (authLoading || !profile) return;
    if (isBlockedRole) {
      setOpen(false);
      setReason("role");
      return;
    }
    if (!isStudent) {
      setOpen(isWeekend());
      setReason(isWeekend() ? "" : "weekday");
      return;
    }
    if (!studentId) {
      setOpen(false);
      setReason("nolink");
      return;
    }
    (async () => {
      const modes = await loadPupilGameModes(studentId);
      const ok = pupilGamesOpen(modes);
      setOpen(ok);
      setReason(ok ? "" : modes.includes("blocked") ? "blocked" : "weekday");
    })();
  }, [authLoading, profile?.role, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || open === null) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Games" sub="Numbers, words and current affairs - learn while you play." />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div>
        <ConfigBanner />
        <PageHeader title="Games" sub="Numbers, words and current affairs - learn while you play." />
        <Card>
          {reason === "role" ? (
            <>
              <h2 className="mb-1 font-semibold">Games are not for this account</h2>
              <p className="text-sm text-slate-600">
                Games are for pupils, parents and teachers. The school admin
                and the platform owner do not play.
              </p>
            </>
          ) : reason === "blocked" ? (
            <>
              <h2 className="mb-1 font-semibold">Games are closed for you right now</h2>
              <p className="text-sm text-slate-600">
                Your parent has blocked games for now. Ask your parent if you
                think this should change.
              </p>
            </>
          ) : reason === "nolink" ? (
            <>
              <h2 className="mb-1 font-semibold">Games are not set up for you yet</h2>
              <p className="text-sm text-slate-600">
                Your login is not linked to a pupil record yet. Ask your school
                admin to link your account, then come back.
              </p>
            </>
          ) : (
            <>
              <h2 className="mb-1 font-semibold">Games open on weekends</h2>
              <p className="text-sm text-slate-600">
                Games open on Saturday and Sunday. Come back at the weekend -
                or ask your parent to allow games for you on weekdays.
              </p>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ConfigBanner />
      <PageHeader
        title="Games"
        sub="Numbers, words and current affairs - short games that build you up and make screen time better."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {GAME_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t.id ? "bg-royal text-white" : "border border-line bg-white text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "numbers" && <NumbersGame />}
      {tab === "words" && <WordsGame />}
      {tab === "affairs" && <AffairsGame />}
      <p className="mt-4 text-xs text-slate-400">
        Games are for learning and fun. They do not change your grades.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- numbers

function NumbersGame() {
  const [questions, setQuestions] = useState(() => makeNumberQuestions(10));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);

  const q = questions[index];
  const playAgain = () => {
    setQuestions(makeNumberQuestions(10));
    setIndex(0);
    setAnswer("");
    setScore(0);
    setFeedback("");
    setDone(false);
  };

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q || answer.trim() === "") return;
    const correct = Number(answer.trim()) === q.answer;
    const nextScore = score + (correct ? 1 : 0);
    setScore(nextScore);
    setFeedback(correct ? "Correct - well done!" : `Not quite - the answer is ${q.answer}.`);
    if (index + 1 >= questions.length) {
      setDone(true);
    } else {
      setIndex(index + 1);
      setAnswer("");
    }
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Numbers - mental maths</h2>
      <p className="mb-3 text-sm text-slate-500">10 questions. Add, subtract and multiply - no calculator.</p>
      {done ? (
        <div>
          <p className="text-3xl font-bold text-royal">{score} / {questions.length}</p>
          <p className="mt-1 text-sm text-slate-600">
            {score === questions.length
              ? "Perfect round - brilliant work!"
              : score >= 7
                ? "Great work - nearly there."
                : "Good try - play again and beat your score."}
          </p>
          {feedback && <p className="mt-2 text-sm font-medium text-royal">{feedback}</p>}
          <button className={`${btnCls} mt-4`} onClick={playAgain}>Play again</button>
        </div>
      ) : (
        <form onSubmit={check} className="space-y-3">
          <p className="text-sm text-slate-500">Question {index + 1} of {questions.length} · Score {score}</p>
          <p className="text-2xl font-bold">{q.text}</p>
          <div>
            <label className={labelCls}>Your answer</label>
            <input
              className={`${inputCls} max-w-xs`}
              type="number"
              inputMode="numeric"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoFocus
            />
          </div>
          <button className={btnCls}>Check</button>
          {feedback && <p className="text-sm font-medium text-royal">{feedback}</p>}
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- words

function WordsGame() {
  const [words, setWords] = useState(() => pickWords(10));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);

  const word = words[index];
  // Scramble once per word, not on every keystroke while typing.
  const scrambled = useMemo(() => (word ? scramble(word) : ""), [word]);
  const playAgain = () => {
    setWords(pickWords(10));
    setIndex(0);
    setAnswer("");
    setScore(0);
    setFeedback("");
    setDone(false);
  };

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (!word || answer.trim() === "") return;
    const correct = answer.trim().toLowerCase() === word;
    const nextScore = score + (correct ? 1 : 0);
    setScore(nextScore);
    setFeedback(correct ? "Correct - well done!" : `Not quite - the word is ${word}.`);
    if (index + 1 >= words.length) {
      setDone(true);
    } else {
      setIndex(index + 1);
      setAnswer("");
    }
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Words - unscramble it</h2>
      <p className="mb-3 text-sm text-slate-500">10 words. Look at the mixed-up letters and type the real word.</p>
      {done ? (
        <div>
          <p className="text-3xl font-bold text-royal">{score} / {words.length}</p>
          <p className="mt-1 text-sm text-slate-600">
            {score === words.length
              ? "Perfect round - brilliant work!"
              : score >= 7
                ? "Great work - nearly there."
                : "Good try - play again and beat your score."}
          </p>
          {feedback && <p className="mt-2 text-sm font-medium text-royal">{feedback}</p>}
          <button className={`${btnCls} mt-4`} onClick={playAgain}>Play again</button>
        </div>
      ) : (
        <form onSubmit={check} className="space-y-3">
          <p className="text-sm text-slate-500">Word {index + 1} of {words.length} · Score {score}</p>
          <p className="text-2xl font-bold tracking-widest">{scrambled.toUpperCase()}</p>
          <div>
            <label className={labelCls}>Your answer</label>
            <input
              className={`${inputCls} max-w-xs`}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoFocus
              placeholder="Type the word"
            />
          </div>
          <button className={btnCls}>Check</button>
          {feedback && <p className="text-sm font-medium text-royal">{feedback}</p>}
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- current affairs

function AffairsGame() {
  const [questions, setQuestions] = useState(() => pickAffairs(10));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);

  const q = questions[index];
  const playAgain = () => {
    setQuestions(pickAffairs(10));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setFeedback("");
    setDone(false);
  };

  const choose = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    const correct = i === q.answer;
    setScore(score + (correct ? 1 : 0));
    setFeedback(correct ? "Correct - well done!" : `Not quite - the answer is ${q.options[q.answer]}.`);
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      setDone(true);
    } else {
      setIndex(index + 1);
      setPicked(null);
      setFeedback("");
    }
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Current Affairs - quiz</h2>
      <p className="mb-3 text-sm text-slate-500">
        10 questions about Nigeria and the world. Starter questions - your
        school can update this set later.
      </p>
      {done ? (
        <div>
          <p className="text-3xl font-bold text-royal">{score} / {questions.length}</p>
          <p className="mt-1 text-sm text-slate-600">
            {score === questions.length
              ? "Perfect round - brilliant work!"
              : score >= 7
                ? "Great work - nearly there."
                : "Good try - play again and beat your score."}
          </p>
          {feedback && <p className="mt-2 text-sm font-medium text-royal">{feedback}</p>}
          <button className={`${btnCls} mt-4`} onClick={playAgain}>Play again</button>
        </div>
      ) : q ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Question {index + 1} of {questions.length} · Score {score}</p>
          <p className="font-semibold">{q.question}</p>
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => choose(i)}
                disabled={picked !== null}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
                  picked === null
                    ? "border border-line bg-white hover:bg-mist"
                    : i === q.answer
                      ? "border border-green-600 bg-green-50 text-green-800"
                      : i === picked
                        ? "border border-red-400 bg-red-50 text-red-700"
                        : "border border-line bg-white opacity-60"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {picked !== null && (
            <>
              <p className="text-sm font-medium text-royal">{feedback}</p>
              <button className={btnCls} onClick={next}>
                {index + 1 >= questions.length ? "See my score" : "Next question"}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No questions yet.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- parent control

/** One child's games setting, shown in the parent workspace. The
 *  parent picks weekends only, any day, or blocked. 'Weekends only'
 *  is the school rule, so it clears the stored setting. */
export function GameAccessControl({
  schoolId,
  parentId,
  studentId,
  studentName,
}: {
  schoolId: string;
  parentId: string;
  studentId: string;
  studentName: string;
}) {
  const [mode, setMode] = useState<GameMode>("weekend");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await loadGameMode(parentId, studentId);
      if (alive) setMode(m);
    })();
    return () => {
      alive = false;
    };
  }, [parentId, studentId]);

  const change = async (next: GameMode) => {
    setBusy(true);
    setMsg("");
    const err = await saveGameMode(schoolId, parentId, studentId, next);
    setBusy(false);
    if (err) {
      setMsg(`Could not save: ${err}`);
      return;
    }
    setMode(next);
    setMsg(
      next === "always"
        ? `${studentName} can play games any day.`
        : next === "blocked"
          ? `Games are blocked for ${studentName}, even on weekends.`
          : `Games for ${studentName} follow the school rule - weekends only.`,
    );
  };

  return (
    <div className="mt-4 rounded-lg bg-mist px-3 py-2 text-sm">
      <label className={labelCls}>Games - {studentName}</label>
      <select
        className={`${inputCls} max-w-xs`}
        value={mode}
        disabled={busy}
        onChange={(e) => change(e.target.value as GameMode)}
        aria-label={`Games setting for ${studentName}`}
      >
        {(Object.keys(GAME_MODE_LABELS) as GameMode[]).map((m) => (
          <option key={m} value={m}>
            {GAME_MODE_LABELS[m]}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">
        Games open on Saturday and Sunday. Allow any day to open them on
        weekdays too, or block them even on weekends.
      </p>
      {msg && <p className="mt-1 text-xs font-medium text-royal">{msg}</p>}
    </div>
  );
}
