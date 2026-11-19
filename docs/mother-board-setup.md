# Mother Board — setup guide (live code)

The Mother Board is the platform-owner control centre in the live
Next.js + Supabase app. This guide is the one-time setup the owner
(Iferetimi) does after deploying. **No passwords, tokens or keys are
written anywhere in this repo** — they live in Supabase / Vercel only.

## 0. What you need first

- The app deployed (Vercel) with `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` set — already done for the pilot.
- Migration `0002_auth_and_mother_board.sql` run in the Supabase SQL
  editor (after 0001). It creates `profiles` + `invites`, adds
  `plan`/`status` to `schools`, and replaces the pilot open RLS policy
  with auth-based policies. Until 0002 is run, the app still works
  unauthenticated the old way; after it is run, **sign-in is required**
  and anonymous visitors see the login page.

## 1. (Recommended) Turn off email confirmation

Supabase Dashboard → Authentication → Providers → Email → turn off
**"Confirm email"**.

Why: with confirmation on, a person who accepts an invite must first
click the email link before they can sign in. The app handles that
(the invite finishes on first sign-in), but with it off the invite
flow is one step: open link → set password → in. Leave it on if you
prefer the extra check.

Also set the **Site URL** (Authentication → URL Configuration) to the
live site, `https://digital-schoolverse.vercel.app`, so password-reset
and confirmation emails link back to the live app.

## 2. Create the platform-owner login

The owner account is created in the Supabase Dashboard — never through
the app, so nobody can promote themselves to platform owner.

1. Supabase Dashboard → Authentication → Users → **Add user**.
   - Email: the owner's email (e.g. `alien4bross@gmail.com`).
   - Password: choose a strong password (the owner types it here;
     it is never written down in chat or code).
   - Tick **"Auto Confirm User"** so the account works immediately.
2. Copy the new user's **UUID** (click the user row → copy the ID).
3. In the Supabase SQL editor, run:

```sql
insert into public.profiles (id, email, display_name, role, school_id)
values ('<PASTE-THE-UUID-HERE>', 'alien4bross@gmail.com', 'Iferetimi', 'platform_owner', null);
```

4. Sign in at `https://digital-schoolverse.vercel.app/login` with that
   email + password. You land on the **Mother Board** (`/mother-board`).

> Keep this login safe. It can create, suspend and delete every school
> and every login on the platform. Turn on two-factor authentication
> for the owner's Supabase and GitHub accounts.

## 3. Create the first school + invite its admin

1. Mother Board → **Schools** → fill in the school name, email, phone,
   plan (Basics / Advanced) and the school admin's email → **Create school**.
2. The page shows an **invite link** for the admin. Copy it and send it
   to the admin yourself (email, WhatsApp or SMS).
3. The admin opens the link, sets a password, and logs in. Their account
   is a `school_admin` for that school only.
4. The admin then sets up their school (profile, terms, classes,
   subjects, students, teachers, parents) and generates logins for
   their own teachers, students and parents — from the school workspace,
   or you can generate them from the Mother Board → School Control.

## 4. How invites work

- An invite is a row in `invites` with a random token, a 7-day expiry
  and a status: **Pending → Accepted** (or Revoked / Expired).
- The invite link is `<site>/invite/<token>`.
- Accepting creates a Supabase Auth user + a `profiles` row with the
  role and school from the invite. The database itself refuses a
  profile that does not match a pending invite for that email, and
  refuses `platform_owner` through the app.
- **No email is sent by the app yet.** The Mother Board shows the link
  and the owner shares it. To send real invite emails later, add a
  server-side sender (Supabase Edge Function + Resend, or Termii for
  SMS) that takes the invite link from `src/lib/invites.ts`
  (`inviteLink()`) and sends it — the invite records already exist,
  so only the sending step is new.

## 5. Day-to-day Mother Board controls

- **Schools** — change plan, suspend / unsuspend, delete a school
  (deletes all of its data — it asks first).
- **Logins & People** — every login on the platform, filter by school
  or role. Suspend / unsuspend a login, send a password reset, delete
  a login. Deleting removes the profile row; remove the auth user
  itself in Supabase → Authentication → Users if needed.
- **Invites** — generate, re-show the link ("Show link" = resend),
  revoke.
- **Analytics** — totals per school and platform-wide.
- **Plans** — move schools between Basics and Advanced.
- **Support** — every complaint across schools, urgent first.
- **Access Model** — who can do what, in plain words.

## 6. What school users see

- **School admin** — their own school's workspace only (Overview,
  Setup, Classes, Subjects, Students, Teachers, Parents, Plan).
  They cannot see other schools or the Mother Board.
- **Teacher / student / parent** — a read-only Overview + Plan for
  now. Their full dashboards (attendance, scores, fees, CBT, AI
  tutor, weekly summaries) are built in the Muse portal and are
  ported next; the roles and the read-only RLS already exist.
- **Platform owner viewing a school workspace** — pick the school in
  the sidebar ("View school workspace as"). With no school picked,
  the workspace shows the first school.

## 7. Security notes

- Migration 0002 drops the pilot open policy. After it runs, the anon
  key alone can read nothing except a still-pending invite — every
  other read/write needs a signed-in user whose profile matches.
- Teacher / student / parent **cannot write** school data: the RLS
  write policies allow only `platform_owner` and `school_admin`.
- The `profiles` insert policy blocks self-promotion to
  `platform_owner`; the owner profile is only ever made in the SQL
  editor (step 2 above).
- Suspended profiles are blocked in the app shell; suspended schools
  cannot be used by their admins (their rows are still there, so
  unsuspending restores them).
