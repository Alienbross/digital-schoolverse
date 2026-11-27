import { supabase } from "@/lib/supabase";
import { PENDING_INVITE_KEY } from "@/lib/auth";
import { EMAIL_NOT_CONFIGURED, requestEmailSend } from "@/lib/email";
import type { Role, SchoolInvite } from "@/lib/types";

/** An invite link is just the site URL + the token. The Mother Board
 *  shows this link and the owner can still share it by hand
 *  (WhatsApp, email, SMS) exactly as before. Live email sending
 *  plugs in here too: sendInviteEmail() below sends this link from
 *  the server (POST /api/email, Resend) when a key is configured,
 *  and the link itself keeps working either way. */
export function inviteLink(token: string, slug?: string | null) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  // A school invite carries the school's path, so the person lands in
  // that school's portal: /greenfield/invite/<token>. Without a slug
  // it falls back to the plain /invite/<token> link.
  const path = slug ? `/${slug}/invite/${token}` : `/invite/${token}`;
  return `${origin}${path}`;
}

export function newInviteToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Email an invite link to the invitee, via Resend (POST /api/email).
 *  The link itself is unchanged - it is still shown on screen to
 *  share by hand. With no key configured this returns sent: false
 *  and nothing is sent; the caller keeps showing the link instead.
 *  Never throws. */
export async function sendInviteEmail(args: {
  email: string;
  schoolName: string;
  role: Role;
  link: string;
}): Promise<{ sent: boolean; configured: boolean; error: string | null }> {
  const roleLabel = args.role.replace("_", " ");
  const subject = `Your Digital SchoolVerse invite - ${args.schoolName}`;
  const text =
    `Hello,\n\n` +
    `You have been invited to join ${args.schoolName} on Digital SchoolVerse as ${roleLabel}.\n\n` +
    `Open this link to accept the invite and set your password:\n${args.link}\n\n` +
    `The invite lasts 7 days. If you were not expecting this, you can ignore it.\n\n` +
    `Digital SchoolVerse`;
  const result = await requestEmailSend({
    kind: "invite",
    to: args.email.trim(),
    subject,
    text,
  });
  return {
    sent: result.sent,
    configured: result.configured,
    error: result.sent ? null : (result.error ?? EMAIL_NOT_CONFIGURED),
  };
}

export async function fetchInvite(token: string) {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) return { invite: null as SchoolInvite | null, error: error.message };
  return { invite: (data as SchoolInvite | null) ?? null, error: null };
}

export async function createInvite(input: {
  email: string;
  role: Role;
  schoolId: string;
  schoolName: string;
  createdBy: string | null;
  daysValid?: number;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
}) {
  const token = newInviteToken();
  const expires = new Date(
    Date.now() + (input.daysValid ?? 7) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("invites")
    .insert({
      token,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      school_id: input.schoolId,
      school_name: input.schoolName,
      teacher_id: input.teacherId ?? null,
      student_id: input.studentId ?? null,
      parent_id: input.parentId ?? null,
      created_by: input.createdBy,
      expires_at: expires,
    })
    .select("*")
    .single();
  if (error) return { invite: null as SchoolInvite | null, error: error.message };
  return { invite: data as SchoolInvite, error: null };
}

/** Finish an invite for the currently signed-in user: create their
 *  profile row from the invite and mark the invite Accepted.
 *  Returns ok=false with a plain message when anything is missing. */
export async function completeInvite(token: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in yet." };

  const { invite, error: fetchError } = await fetchInvite(token);
  if (fetchError) return { ok: false, error: fetchError };
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.status !== "Pending")
    return { ok: false, error: `This invite is ${invite.status.toLowerCase()}.` };
  if (new Date(invite.expires_at).getTime() < Date.now())
    return { ok: false, error: "This invite has expired." };
  if (invite.email.toLowerCase() !== (user.email ?? "").toLowerCase())
    return {
      ok: false,
      error: `This invite was sent to ${invite.email}. Sign in with that email.`,
    };

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!existing) {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      display_name: (user.email ?? "").split("@")[0] || null,
      role: invite.role,
      school_id: invite.school_id,
      teacher_id: invite.teacher_id,
      student_id: invite.student_id,
      parent_id: invite.parent_id,
    });
    if (profileError)
      return { ok: false, error: `Could not create your profile: ${profileError.message}` };
  }

  const { error: updateError } = await supabase
    .from("invites")
    .update({ status: "Accepted", accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id);
  if (updateError)
    return { ok: false, error: `Could not mark the invite accepted: ${updateError.message}` };

  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore */
  }
  return { ok: true, error: null, invite };
}
