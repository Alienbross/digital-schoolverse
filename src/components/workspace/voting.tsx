"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";
import {
  AUDIENCE_OPTIONS,
  audienceNeedsClass,
  castVote,
  closeVote,
  createVote,
  deleteVote,
  fetchClassIdsForUser,
  fetchSchoolClasses,
  fetchVoteResults,
  fetchVotesForUser,
  isVoteOpen,
  uploadVoteOptionImage,
  VOTE_IMAGE_ACCEPT_ATTR,
  type AudienceType,
  type SchoolClass,
  type VoteResult,
  type VoteWithOptions,
  type VotingUser,
} from "@/lib/voting";

/** Voting: the school admin creates votes and closes them; everybody
 *  else votes in the ones they are eligible for. One vote per person
 *  per vote, and results show only after a vote closes. */
export default function VotingSection({
  schoolId,
  mode,
}: {
  schoolId: string;
  mode: "admin" | "vote";
}) {
  const { profile, loading: authLoading } = useAuth();
  const [openVotes, setOpenVotes] = useState<VoteWithOptions[]>([]);
  const [closedVotes, setClosedVotes] = useState<VoteWithOptions[]>([]);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Admin create-vote form.
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [audience, setAudience] = useState<AudienceType>("everybody");
  const [classId, setClassId] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [optionNames, setOptionNames] = useState<string[]>(["", ""]);
  const [optionImages, setOptionImages] = useState<(string | null)[]>([null, null]);
  const [uploading, setUploading] = useState(false);

  // Results, keyed by vote id, once a vote is closed.
  const [results, setResults] = useState<Record<string, { results: VoteResult[]; total: number }>>({});

  const user: VotingUser | null = profile
    ? {
        id: profile.id,
        role: profile.role,
        teacher_id: profile.teacher_id,
        student_id: profile.student_id,
        parent_id: profile.parent_id,
      }
    : null;

  const load = async () => {
    if (!user) return;
    const classIds = await fetchClassIdsForUser(user);
    const { open, closed, votedVoteIds } = await fetchVotesForUser(schoolId, user, classIds);
    setOpenVotes(open);
    setClosedVotes(closed);
    setVotedIds(votedVoteIds);
    if (mode === "admin") setClasses(await fetchSchoolClasses(schoolId));
    setLoaded(true);
  };

  useEffect(() => {
    if (authLoading || !user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, schoolId, mode]);

  const loadResults = async (voteId: string) => {
    const res = await fetchVoteResults(voteId);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setResults((prev) => ({ ...prev, [voteId]: { results: res.data.results, total: res.data.total } }));
  };

  useEffect(() => {
    closedVotes.forEach((v) => {
      if (!results[v.id]) loadResults(v.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedVotes]);

  const setOptionName = (i: number, value: string) => {
    setOptionNames((prev) => prev.map((n, j) => (j === i ? value : n)));
  };

  const addOption = () => {
    setOptionNames((prev) => [...prev, ""]);
    setOptionImages((prev) => [...prev, null]);
  };

  const removeOption = (i: number) => {
    if (optionNames.length <= 2) return;
    setOptionNames((prev) => prev.filter((_, j) => j !== i));
    setOptionImages((prev) => prev.filter((_, j) => j !== i));
  };

  const uploadOptionImage = async (i: number, file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const res = await uploadVoteOptionImage(schoolId, file);
    setUploading(false);
    if (res.error || !res.url) {
      setMsg(res.error ?? "Could not upload the picture.");
      return;
    }
    setOptionImages((prev) => prev.map((u, j) => (j === i ? res.url! : u)));
  };

  const submitVote = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const res = await createVote({
      schoolId,
      title,
      question,
      anonymous,
      audienceType: audience,
      classId: audienceNeedsClass(audience) ? classId || null : null,
      opensAt: opensAt || null,
      closesAt: closesAt || null,
      options: optionNames.map((name, i) => ({ name, imageUrl: optionImages[i] ?? null })),
    });
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg("Vote created.");
    setTitle("");
    setQuestion("");
    setAnonymous(false);
    setAudience("everybody");
    setClassId("");
    setOpensAt("");
    setClosesAt("");
    setOptionNames(["", ""]);
    setOptionImages([null, null]);
    load();
  };

  const doClose = async (vote: VoteWithOptions) => {
    setBusyId(vote.id);
    const res = await closeVote(vote.id);
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(`"${vote.title}" is now closed - results are visible below.`);
    load();
  };

  const doDelete = async (vote: VoteWithOptions) => {
    if (!window.confirm(`Delete "${vote.title}"? Its options and votes go with it.`)) return;
    setBusyId(vote.id);
    const res = await deleteVote(vote.id);
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg("Vote deleted.");
    load();
  };

  const doVote = async (vote: VoteWithOptions, optionId: string) => {
    setBusyId(`${vote.id}:${optionId}`);
    const res = await castVote(vote.id, optionId);
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg("Your vote is saved - thank you.");
    setVotedIds((prev) => [...prev, vote.id]);
    load();
  };

  const audienceLabel = (vote: VoteWithOptions) => {
    const base = AUDIENCE_OPTIONS.find((a) => a.id === vote.audience_type)?.label ?? vote.audience_type;
    if (!vote.class_id) return base;
    const cls = classes.find((c) => c.id === vote.class_id);
    return cls ? `${base} - ${cls.name}` : base;
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : "No date set";

  const renderResults = (vote: VoteWithOptions) => {
    const r = results[vote.id];
    if (!r) return <p className="text-sm text-slate-500">Loading results…</p>;
    if (r.total === 0) return <p className="text-sm text-slate-500">No votes were cast.</p>;
    return (
      <ul className="space-y-2">
        {r.results.map(({ option, count }) => {
          const pct = Math.round((count / r.total) * 100);
          return (
            <li key={option.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {option.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                  )}
                  {option.name}
                </span>
                <span className="font-semibold">
                  {count} vote{count === 1 ? "" : "s"} - {pct}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-mist">
                <div className="h-full bg-royal" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
        <li className="text-xs text-slate-500">{r.total} vote{r.total === 1 ? "" : "s"} in total.</li>
      </ul>
    );
  };

  const renderOptionsForVoting = (vote: VoteWithOptions) => {
    const voted = votedIds.includes(vote.id);
    const open = isVoteOpen(vote);
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {vote.options.map((option) => (
          <div key={option.id} className="rounded-xl border border-line p-3 text-center">
            {option.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={option.image_url}
                alt={option.name}
                className="mx-auto h-28 w-28 rounded-lg object-cover"
              />
            ) : (
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-lg bg-mist text-2xl font-bold text-slate-400">
                {option.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <p className="mt-2 text-sm font-semibold">{option.name}</p>
            <button
              className={btnCls}
              disabled={!open || voted || busyId === `${vote.id}:${option.id}`}
              onClick={() => doVote(vote, option.id)}
            >
              {voted ? "Voted" : "Vote"}
            </button>
          </div>
        ))}
      </div>
    );
  };

  if (authLoading || !loaded) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }
  if (!profile || !user) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-bold text-ink">Voting</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to see your school&apos;s votes.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <PageHeader
        title="Voting"
        sub={
          mode === "admin"
            ? "Create votes for your school, close them when voting ends, and see the results."
            : "Vote in the polls open to you - one vote per person. Results show when a vote closes."
        }
      />
      <ConfigBanner />
      {msg && <p className="mb-4 text-sm font-medium text-royal">{msg}</p>}

      {mode === "admin" && (
        <Card>
          <h2 className="mb-3 font-semibold">Create a vote</h2>
          <form onSubmit={submitVote} className="space-y-3">
            <div>
              <label className={labelCls}>Title</label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Pick the end-of-term gift"
              />
            </div>
            <div>
              <label className={labelCls}>Question (optional)</label>
              <input
                className={inputCls}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Which gift should we buy for the graduating class?"
              />
            </div>
            <div>
              <label className={labelCls}>Who can vote</label>
              <select
                className={inputCls}
                value={audience}
                onChange={(e) => setAudience(e.target.value as AudienceType)}
              >
                {AUDIENCE_OPTIONS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
            {audienceNeedsClass(audience) && (
              <div>
                <label className={labelCls}>Class</label>
                <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">- Pick a class -</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} - {c.stage}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Opens (optional)</label>
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Closes (optional)</label>
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />
              Anonymous - nobody sees who voted for what
            </label>
            <div>
              <span className={labelCls}>Options - at least two, each with a typed name and an optional picture</span>
              <ul className="space-y-3">
                {optionNames.map((name, i) => (
                  <li key={i} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className={inputCls}
                        value={name}
                        onChange={(e) => setOptionName(i, e.target.value)}
                        placeholder={`Option ${i + 1} name`}
                      />
                      {optionNames.length > 2 && (
                        <button
                          type="button"
                          className="text-sm font-semibold text-red-600"
                          onClick={() => removeOption(i)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {optionImages[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={optionImages[i]!} alt="" className="h-12 w-12 rounded object-cover" />
                      ) : (
                        <span className="text-xs text-slate-400">No picture yet</span>
                      )}
                      <label className="cursor-pointer text-sm font-semibold text-royal">
                        {uploading ? "Uploading…" : "Upload picture"}
                        <input
                          type="file"
                          accept={VOTE_IMAGE_ACCEPT_ATTR}
                          className="hidden"
                          onChange={(e) => uploadOptionImage(i, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="mt-2 text-sm font-semibold text-royal" onClick={addOption}>
                + Add another option
              </button>
            </div>
            <button className={btnCls} disabled={uploading}>Create vote</button>
          </form>
        </Card>
      )}

      <div className="mt-6 space-y-4">
        <h2 className="font-semibold">Open votes</h2>
        {openVotes.length === 0 && (
          <p className="text-sm text-slate-500">No open votes right now.</p>
        )}
        {openVotes.map((vote) => {
          const voted = votedIds.includes(vote.id);
          const open = isVoteOpen(vote);
          return (
            <Card key={vote.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{vote.title}</h3>
                  {vote.question && <p className="mt-1 text-sm text-slate-600">{vote.question}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    {audienceLabel(vote)}
                    {vote.anonymous ? " · Anonymous" : ""}
                    {" · "}Opens: {fmtDate(vote.opens_at)} · Closes: {fmtDate(vote.closes_at)}
                  </p>
                </div>
                {mode === "admin" && (
                  <div className="flex shrink-0 gap-2">
                    <button className={btnCls} disabled={busyId === vote.id} onClick={() => doClose(vote)}>
                      Close
                    </button>
                    <button
                      className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-red-600"
                      disabled={busyId === vote.id}
                      onClick={() => doDelete(vote)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              {mode === "vote" && (
                <>
                  {renderOptionsForVoting(vote)}
                  {voted && (
                    <p className="mt-3 text-sm font-medium text-royal">
                      You voted - results show when the vote closes.
                    </p>
                  )}
                  {!voted && !open && (
                    <p className="mt-3 text-sm text-slate-500">
                      This vote is not open for voting yet, or its closing time has passed.
                    </p>
                  )}
                </>
              )}
              {mode === "admin" && (
                <p className="mt-3 text-sm text-slate-500">
                  {vote.options.length} option{vote.options.length === 1 ? "" : "s"} ·{" "}
                  {vote.options.map((o) => o.name).join(", ")}
                </p>
              )}
            </Card>
          );
        })}

        <h2 className="pt-2 font-semibold">Closed votes - results</h2>
        {closedVotes.length === 0 && (
          <p className="text-sm text-slate-500">No closed votes yet.</p>
        )}
        {closedVotes.map((vote) => (
          <Card key={vote.id}>
            <h3 className="font-semibold">{vote.title}</h3>
            {vote.question && <p className="mt-1 text-sm text-slate-600">{vote.question}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {audienceLabel(vote)}
              {vote.anonymous ? " · Anonymous" : ""}
              {" · "}Closed: {fmtDate(vote.closes_at)}
            </p>
            <div className="mt-3">{renderResults(vote)}</div>
            {mode === "admin" && (
              <button
                className="mt-3 text-sm font-semibold text-red-600"
                disabled={busyId === vote.id}
                onClick={() => doDelete(vote)}
              >
                Delete
              </button>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
