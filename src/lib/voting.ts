// Voting system (migration 0020).
// A vote is open to everybody, to the parents of one class, to the
// students of one class, or to teachers of the Primary or Secondary
// stage. Each voter gets exactly one ballot per vote; results are
// only shown once the vote is closed. Eligibility is filtered here
// in the app - RLS only keeps schools apart.

import { supabase } from "@/lib/supabase";
import { LOGO_BUCKET, LOGO_ACCEPT_ATTR, MAX_LOGO_BYTES, validateLogoFile } from "@/lib/logo";

export type AudienceType =
  | "everybody"
  | "parents_of_class"
  | "students_of_class"
  | "teachers_primary"
  | "teachers_secondary";

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  everybody: "Everybody",
  parents_of_class: "Parents of one class",
  students_of_class: "Students of one class",
  teachers_primary: "Teachers - Primary",
  teachers_secondary: "Teachers - Secondary",
};

export const AUDIENCE_OPTIONS: { id: AudienceType; label: string }[] = (
  Object.keys(AUDIENCE_LABELS) as AudienceType[]
).map((id) => ({ id, label: AUDIENCE_LABELS[id] }));

/** True when the audience needs a class picked. */
export function audienceNeedsClass(audience: AudienceType): boolean {
  return audience === "parents_of_class" || audience === "students_of_class";
}

export type Vote = {
  id: string;
  school_id: string;
  title: string;
  question: string | null;
  anonymous: boolean;
  audience_type: AudienceType;
  class_id: string | null;
  opens_at: string | null;
  closes_at: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
};

export type VoteOption = {
  id: string;
  vote_id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
};

export type VoteWithOptions = Vote & { options: VoteOption[] };

export type VoteBallot = {
  id: string;
  vote_id: string;
  option_id: string;
  voter_id: string;
  voter_role: string | null;
  voted_at: string;
};

export type VoteResult = {
  option: VoteOption;
  count: number;
};

/** The signed-in user, as the voting lib needs them. Map from the
 *  auth profile in the component; voting.ts never imports types.ts. */
export type VotingUser = {
  id: string;
  role: string;
  teacher_id: string | null;
  student_id: string | null;
  parent_id: string | null;
};

export type SchoolClass = {
  id: string;
  name: string;
  stage: string;
  arm: string | null;
};

type OkResult<T> = { ok: true; data: T };
type ErrResult = { ok: false; error: string };
type Result<T> = OkResult<T> | ErrResult;

/** A vote can be voted in right now: status Open and inside its
 *  open / close window (either end may be blank = no limit). */
export function isVoteOpen(vote: Vote, now: Date = new Date()): boolean {
  if (vote.status !== "Open") return false;
  if (vote.opens_at && new Date(vote.opens_at) > now) return false;
  if (vote.closes_at && new Date(vote.closes_at) < now) return false;
  return true;
}

/** Classes of one school, for the admin audience picker. */
export async function fetchSchoolClasses(
  schoolId: string,
): Promise<SchoolClass[]> {
  const { data } = await supabase
    .from("classes")
    .select("id, name, stage, arm")
    .eq("school_id", schoolId)
    .order("stage")
    .order("name");
  return (data as SchoolClass[] | null) ?? [];
}

/** Class ids a parent may vote for: the classes of their linked
 *  children. A student gets their own class; anyone else gets []. */
export async function fetchClassIdsForUser(
  user: VotingUser,
): Promise<string[]> {
  if (user.role === "student" && user.student_id) {
    const { data } = await supabase
      .from("students")
      .select("class_id")
      .eq("id", user.student_id)
      .maybeSingle();
    const classId = (data as { class_id: string | null } | null)?.class_id;
    return classId ? [classId] : [];
  }
  if (user.role === "parent" && user.parent_id) {
    const { data } = await supabase
      .from("parent_children")
      .select("students(class_id)")
      .eq("parent_id", user.parent_id)
      .eq("status", "Active");
    const rows = (data as { students: { class_id: string | null } | null }[] | null) ?? [];
    return rows
      .map((r) => r.students?.class_id)
      .filter((c): c is string => Boolean(c));
  }
  return [];
}

/** Stages ("Primary" / "Secondary") of the classes one teacher
 *  teaches: assigned subjects, classes they picked at registration,
 *  and classes where they are class teacher. */
export async function fetchTeacherClassStages(
  teacherId: string,
): Promise<string[]> {
  const classIds = new Set<string>();
  const { data: subjects } = await supabase
    .from("class_subjects")
    .select("class_id")
    .eq("teacher_id", teacherId);
  ((subjects as { class_id: string }[] | null) ?? []).forEach((r) =>
    classIds.add(r.class_id),
  );
  const { data: picks } = await supabase
    .from("teacher_class_picks")
    .select("class_id")
    .eq("teacher_id", teacherId);
  ((picks as { class_id: string }[] | null) ?? []).forEach((r) =>
    classIds.add(r.class_id),
  );
  const { data: homerooms } = await supabase
    .from("classes")
    .select("id")
    .eq("class_teacher_id", teacherId);
  ((homerooms as { id: string }[] | null) ?? []).forEach((r) =>
    classIds.add(r.id),
  );
  if (classIds.size === 0) return [];
  const { data: classes } = await supabase
    .from("classes")
    .select("stage")
    .in("id", [...classIds]);
  return [...new Set(((classes as { stage: string }[] | null) ?? []).map((c) => c.stage))];
}

/** True when this user may see and vote in this vote. */
export function isEligibleForVote(
  vote: Vote,
  user: VotingUser,
  classIds: string[],
  teacherStages: string[],
): boolean {
  switch (vote.audience_type) {
    case "everybody":
      return true;
    case "parents_of_class":
      return (
        user.role === "parent" && vote.class_id !== null && classIds.includes(vote.class_id)
      );
    case "students_of_class":
      return (
        user.role === "student" && vote.class_id !== null && classIds.includes(vote.class_id)
      );
    case "teachers_primary":
      return user.role === "teacher" && teacherStages.includes("Primary");
    case "teachers_secondary":
      return user.role === "teacher" && teacherStages.includes("Secondary");
    default:
      return false;
  }
}

/** Open and closed votes this user is eligible for, plus the ids of
 *  votes they have already voted in. Admins and the platform owner
 *  see every vote in the school (they manage votes, they do not vote). */
export async function fetchVotesForUser(
  schoolId: string,
  user: VotingUser,
  classIds: string[],
): Promise<{
  open: VoteWithOptions[];
  closed: VoteWithOptions[];
  votedVoteIds: string[];
}> {
  const empty = { open: [], closed: [], votedVoteIds: [] } as {
    open: VoteWithOptions[];
    closed: VoteWithOptions[];
    votedVoteIds: string[];
  };
  const { data } = await supabase
    .from("votes")
    .select("*, vote_options(*)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  const rows = (data as (Vote & { vote_options: VoteOption[] })[] | null) ?? [];
  const votes: VoteWithOptions[] = rows.map((r) => ({
    ...r,
    options: [...(r.vote_options ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));

  const isAdmin = user.role === "school_admin" || user.role === "platform_owner";
  let eligible = votes;
  if (!isAdmin) {
    const teacherStages =
      user.role === "teacher" && user.teacher_id
        ? await fetchTeacherClassStages(user.teacher_id)
        : [];
    eligible = votes.filter((v) => isEligibleForVote(v, user, classIds, teacherStages));
  }

  const { data: ballots } = await supabase
    .from("vote_ballots")
    .select("vote_id")
    .eq("voter_id", user.id);
  const votedVoteIds = [...new Set(((ballots as { vote_id: string }[] | null) ?? []).map((b) => b.vote_id))];

  return {
    open: eligible.filter((v) => v.status === "Open"),
    closed: eligible.filter((v) => v.status === "Closed"),
    votedVoteIds,
  };
}

/** Cast one vote. Returns a clear error when the user already voted,
 *  the vote is closed, or the option does not belong to the vote. */
export async function castVote(
  voteId: string,
  optionId: string,
): Promise<Result<{ ballotId: string }>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { data: voteRow } = await supabase
    .from("votes")
    .select("*")
    .eq("id", voteId)
    .maybeSingle();
  const vote = voteRow as Vote | null;
  if (!vote) return { ok: false, error: "This vote no longer exists." };
  if (!isVoteOpen(vote)) {
    return { ok: false, error: "This vote is closed - you can no longer vote in it." };
  }

  const { data: optionRow } = await supabase
    .from("vote_options")
    .select("id")
    .eq("id", optionId)
    .eq("vote_id", voteId)
    .maybeSingle();
  if (!optionRow) return { ok: false, error: "That option does not belong to this vote." };

  const { data: existing } = await supabase
    .from("vote_ballots")
    .select("id")
    .eq("vote_id", voteId)
    .eq("voter_id", user.id)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "You have already voted in this vote - one vote per person." };
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profileRow as { role: string } | null)?.role ?? null;

  const { data: inserted, error } = await supabase
    .from("vote_ballots")
    .insert({ vote_id: voteId, option_id: optionId, voter_id: user.id, voter_role: role })
    .select("id")
    .single();
  if (error || !inserted) {
    // The unique (vote_id, voter_id) constraint is the backstop: a
    // second ballot raced in first.
    if (error?.message.includes("vote_ballots_vote_id_voter_id_key")) {
      return { ok: false, error: "You have already voted in this vote - one vote per person." };
    }
    return { ok: false, error: `Could not save your vote: ${error?.message ?? "unknown error"}` };
  }
  return { ok: true, data: { ballotId: (inserted as { id: string }).id } };
}

/** Per-option counts for one vote. Only callable once the vote is
 *  closed - results never show while voting is still open. */
export async function fetchVoteResults(
  voteId: string,
): Promise<Result<{ vote: VoteWithOptions; results: VoteResult[]; total: number }>> {
  const { data: voteRow } = await supabase
    .from("votes")
    .select("*, vote_options(*)")
    .eq("id", voteId)
    .maybeSingle();
  const row = voteRow as (Vote & { vote_options: VoteOption[] }) | null;
  if (!row) return { ok: false, error: "This vote no longer exists." };
  if (row.status !== "Closed") {
    return { ok: false, error: "Results show only after the vote closes." };
  }
  const options = [...(row.vote_options ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const vote: VoteWithOptions = { ...row, options };
  const { data: ballots } = await supabase
    .from("vote_ballots")
    .select("option_id")
    .eq("vote_id", voteId);
  const counts = new Map<string, number>();
  ((ballots as { option_id: string }[] | null) ?? []).forEach((b) => {
    counts.set(b.option_id, (counts.get(b.option_id) ?? 0) + 1);
  });
  const results = options.map((option) => ({
    option,
    count: counts.get(option.id) ?? 0,
  }));
  return {
    ok: true,
    data: { vote, results, total: results.reduce((sum, r) => sum + r.count, 0) },
  };
}

export type CreateVoteInput = {
  schoolId: string;
  title: string;
  question: string | null;
  anonymous: boolean;
  audienceType: AudienceType;
  classId: string | null;
  opensAt: string | null;
  closesAt: string | null;
  options: { name: string; imageUrl: string | null }[];
};

/** Create a vote with its options (admin only - enforced by RLS). */
export async function createVote(
  input: CreateVoteInput,
): Promise<Result<{ voteId: string }>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  const options = input.options.map((o) => o.name.trim()).filter(Boolean);
  if (!input.title.trim()) return { ok: false, error: "Give the vote a title." };
  if (options.length < 2) return { ok: false, error: "Add at least two options." };
  if (audienceNeedsClass(input.audienceType) && !input.classId) {
    return { ok: false, error: "Pick the class this vote is for." };
  }

  const { data: voteRow, error: voteError } = await supabase
    .from("votes")
    .insert({
      school_id: input.schoolId,
      title: input.title.trim(),
      question: input.question?.trim() || null,
      anonymous: input.anonymous,
      audience_type: input.audienceType,
      class_id: input.classId,
      opens_at: input.opensAt || null,
      closes_at: input.closesAt || null,
      status: "Open",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (voteError || !voteRow) {
    return { ok: false, error: `Could not create the vote: ${voteError?.message ?? "unknown error"}` };
  }
  const voteId = (voteRow as { id: string }).id;
  const { error: optionsError } = await supabase.from("vote_options").insert(
    input.options
      .filter((o) => o.name.trim())
      .map((o, i) => ({
        vote_id: voteId,
        name: o.name.trim(),
        image_url: o.imageUrl || null,
        sort_order: i + 1,
      })),
  );
  if (optionsError) {
    return { ok: false, error: `Vote created, but its options did not save: ${optionsError.message}` };
  }
  return { ok: true, data: { voteId } };
}

/** Close a vote (admin only - enforced by RLS). Results show after this. */
export async function closeVote(voteId: string): Promise<Result<void>> {
  const { error } = await supabase
    .from("votes")
    .update({ status: "Closed", closes_at: new Date().toISOString() })
    .eq("id", voteId);
  if (error) return { ok: false, error: `Could not close the vote: ${error.message}` };
  return { ok: true, data: undefined };
}

/** Delete a vote and everything under it (admin only - enforced by
 *  RLS; options and ballots go with it through cascade). */
export async function deleteVote(voteId: string): Promise<Result<void>> {
  const { error } = await supabase.from("votes").delete().eq("id", voteId);
  if (error) return { ok: false, error: `Could not delete the vote: ${error.message}` };
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- option pictures
// Option pictures reuse the existing public `school-logos` bucket
// (migration 0003) - no new bucket. Files live under
// `<school_id>/votes/<file>`, so the 0003 upload policy (owner or
// that school's own school_admin) already covers them.

export { LOGO_ACCEPT_ATTR as VOTE_IMAGE_ACCEPT_ATTR };

/** Upload one option picture. Returns the public URL on success. */
export async function uploadVoteOptionImage(
  schoolId: string,
  file: File,
): Promise<{ url?: string; error?: string }> {
  const problem = validateLogoFile(file);
  if (problem) return { error: problem };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${schoolId}/votes/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) return { error: `Could not upload the picture: ${uploadError.message}` };
  const {
    data: { publicUrl },
  } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return { url: publicUrl };
}

/** A picture must be 2 MB or smaller - same limit as school logos. */
export const MAX_VOTE_IMAGE_BYTES = MAX_LOGO_BYTES;
