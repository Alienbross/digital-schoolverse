# Digital SchoolVerse - Live Pilot (free tier)

Real code for the Digital SchoolVerse school portal: **Next.js 16 (App Router)
+ Tailwind CSS v4 + Supabase (PostgreSQL)**. Royal Blue `#1D4ED8` + Sky
`#38BDF8`, light default theme. This is the go-live build - the Muse portal
artifact (`digital-schoolverse-portal`) was the working prototype; this repo
is the real app that can be deployed and shared.

## What is in this pilot

- **Foundation + Admin core** (live): Overview with setup checklist and live
  counts, School Setup (profile, sessions & terms), Classes & Arms (with
  branches), Subjects (per-class assignments + subject teachers), Students
  register (auto admission numbers `DSV/2026/0001…`, search), Teachers &
  Staff, Parents (parent-child linking, siblings share one parent), Plan &
  Roadmap page.
- **Supabase schema** in `supabase/migrations/0001_initial_schema.sql` -
  the full data model carried over from the Muse portal: schools, branches,
  terms, classes, subjects, students, parents, attendance, scores
  (Test /20, Assignment /10, Exam /70), fee bills/payments/online payments,
  complaints (`CMP-…`), homework, timetable, messages/announcements,
  admissions (`ADM-…`), AI drafts, CBT tests/questions/attempts, parent
  alerts, weekly summaries, bus routes/assignments/attendance, clinic
  visits, discipline records, report card templates. Every table carries
  `school_id` so schools stay separate.
- **Advanced features** (AI Teacher Assistant, online fee payment, CBT,
  analytics, SMS/WhatsApp, weekly summaries, bus/clinic/discipline,
  multi-branch report cards, online complaint forms) are built in the Muse
  portal and are ported next, in that order - see `src/app/plan/page.tsx`.
  The Teacher, Student and Parent workspaces are now ported (migration
  0005): registers, scores, homework, CBT practice, fees with a test
  checkout, complaints, messages and AI drafting assistants.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

Without env vars the app still builds and runs, but shows a
“Supabase not connected yet” banner and empty registers - nothing is saved.

## Set up Supabase (free tier - $0)

1. Create a project at supabase.com (free tier; it pauses after a week idle -
   fine for the pilot, move to Pro $25/mo before charging schools).
2. In the Supabase SQL editor, run
   `supabase/migrations/0001_initial_schema.sql`, then
   `supabase/migrations/0002_auth_and_mother_board.sql`, then
   `supabase/migrations/0003_school_logos.sql` (school logos bucket),
   then `supabase/migrations/0004_school_slugs.sql` (per-school path
   URLs - each school gets its own address, e.g. `/greenfield`), then
   `supabase/migrations/0005_role_workspaces.sql` (scoped write access
   for teacher / student / parent roles - registers, scores, CBT
   attempts, complaints, messages, test fee payments), then
   `supabase/migrations/0006_registration_approvals.sql`
   (self-registration + approvals, in-app notifications), then
   `supabase/migrations/0007_admission_fees_uploads.sql` (admission
   form fee test checkout + document uploads), then
   `supabase/migrations/0008_absence_emails.sql` (absence emails to
   parents - queued in the portal, no live email provider yet).
3. Copy the project URL + anon key (Settings → API) into `.env.local`.

## Auth + Mother Board (live in this build)

- **Sign-in** at `/login` (Supabase Auth, email + password). Roles:
  `platform_owner` (Mother Board, full control), `school_admin` (own
  school only), `teacher` / `student` / `parent` - each lands in their
  own workspace after sign-in (`/<slug>/teacher`, `/<slug>/student`,
  `/<slug>/parent`): registers and scores for teachers, results/CBT
  practice for students, children/fees/complaints for parents. A teacher
  only sees their classes and subjects, a student only their own records,
  a parent only their linked children (scoped writes: migration 0005).
  The owner / school admin can preview any role workspace by picking
  the person at the top of the page.
- **Mother Board** at `/mother-board`: Overview, Schools (create /
  suspend / delete, plan Basics/Advanced), School Control (per-school
  people + generate logins), Logins & People (suspend, reset password,
  delete), Invites, Analytics, Plans, Support (complaints, urgent
  first), Access Model.
- **Invites**: generating an invite creates a record with a token and
  a 7-day expiry; the invite link is `/<school-slug>/invite/<token>`
  (or `/invite/<token>` without a slug). The invitee sets a password
  and logs in. **No email is sent by the app yet** - the Mother Board
  shows the link and the owner shares it.
- **Per-school path URLs**: each school has a short name (slug, e.g.
  `greenfield`) set by the platform owner when the school is created,
  and its own address `digital-schoolverse.vercel.app/greenfield`.
  The whole workspace works under `/<slug>/…` (`/greenfield/students`,
  `/greenfield/setup`, …) with that school's logo in the header, and
  sign-in at `/<slug>/login` lands in that school. The plain `/…`
  routes keep working for the platform owner. An unknown slug shows a
  "School not found" page, and a user opening another school's path
  sees a "belongs to another school" page - RLS still enforces it.
- **Self-registration + approvals** (migration 0006): teachers,
  students and parents register themselves from the school's own
  link - `/<slug>/register` (chooser), `/<slug>/register/teacher`,
  `/<slug>/register/student`, `/<slug>/register/parent`. No invite
  needed. The admin opens each phase in order in School Setup
  (teachers, then students, then parents - or all at once); a closed
  phase shows "not open yet". Parents add their pupil(s) by admission
  number (best) or name + class; each link starts as a proposal the
  admin and the pupil's class teacher are notified about, so a wrong
  child / wrong class is caught before approval. Accounts start
  **Pending** and can only complete their profile/setup until
  approved - registers, scores, fees, complaints, messages and CBT
  stay locked (banner + locked tabs in the workspaces, and RLS in
  migration 0006 refuses the writes). Approvals live under
  Registration & Approvals: teachers by the school admin only,
  students by their class teacher or the admin, parents by the admin
  or senior staff (a teacher the admin flags "can approve parents" in
  Teachers & Staff). Approving a parent also approves their pupil
  links. In-app notifications (bell in the header, no email yet) go
  to the admin on every registration, to class teachers on pupil
  links, and to the user on approval / rejection. School admins still
  do NOT self-register - the platform owner invites them from the
  Mother Board, as before.
- **Absence emails to parents** (migration 0008): when a teacher
  saves a register with a pupil marked Absent (or Late, as a milder
  notice), the portal queues one email notice per linked parent
  (Approved links only) in the `absence_emails` table - pupil,
  parent, parent email, date, reason, status. No live email provider
  is connected yet, so no real email is sent: rows are labelled
  Queued - no live email provider yet and shown in the portal
  instead (the parent's workspace, the teacher's register page, and
  the admin Overview log). Parents with no email on record are
  flagged Unreachable - no email on record in the log, never
  silently skipped. The teacher can add an optional reason per
  Absent / Late pupil, saved on the register row and copied into
  the notice. Re-saving a register updates the notice in place and
  clears still-queued notices for pupils re-marked Present /
  Excused. The plug-in point for a real sender is `sendAbsenceEmail`
  in `src/lib/absence-emails.ts` (Resend / SendGrid later).
- **First owner login**: create the user in Supabase → Authentication
  → Users, then insert their `profiles` row with role
  `platform_owner` in the SQL editor. Full steps in
  `docs/mother-board-setup.md`.
- **Light / Dark theme**: toggle in the header on every page (Light
  default `#F8FAFC`, Dark deep navy `#0B1220`), choice saved.

> **Security:** migration 0002 replaces the pilot open RLS policy with
> auth-based policies - platform owner sees everything, school users
> see only their own school, and only the owner / school admin may
> write school data. The owner profile can only be created in the SQL
> editor, never through the app.

## Deploy (free pilot)

1. Push this folder to GitHub (repo under the owner's name - still needed).
2. Import the repo in Vercel (Hobby plan, $0 - personal/non-commercial
   only; Pro $20/mo for the live business site).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
   Vercel → Project Settings → Environment Variables.
4. Deploy. Vercel gives a `*.vercel.app` link to share with the pilot
   school; add the bought domain (e.g. `app.digitalschoolverse.com`,
   ~₦14,000–₦18,000/year for .com) later in Vercel → Domains.

## What still needs the user

- **Run migration 0008** in the Supabase SQL editor (see above) -
  until then absence emails cannot be queued: saving a register
  with a pupil Absent / Late will fail to record the parent notice
  (the register itself still saves, with a note saying the queue
  failed). Run it after 0007, then push + redeploy.
- **Live email provider for absence emails** - absence notices are
  queued in the portal only (labelled Queued - no live email
  provider yet) until a provider such as Resend or SendGrid is
  connected; the plug-in point is `sendAbsenceEmail` in
  `src/lib/absence-emails.ts`.
- **Run migration 0006** in the Supabase SQL editor (see above) -
  until then the register pages show "School not found" (the
  `school_registration_status` RPC does not exist yet), approvals do
  not run, and the phase switches have nowhere to save. Run it after
  0005, then push + redeploy.
- **Run migration 0005** in the Supabase SQL editor (see above) -
  until then teachers cannot save registers/scores, students cannot
  submit CBT attempts, and parents cannot pay online or raise
  complaints (migration 0002 only let admins write).
- **Run migration 0002** in the Supabase SQL editor (see above) -
  until then the live site still works the old unauthenticated way.
- **Create the platform-owner login** (Supabase Dashboard + one SQL
  insert) - see `docs/mother-board-setup.md`.
- **Pilot school** - one real school to test end to end before opening registration.
- **Domain** - not bought yet.
- **Paystack live keys** - online fee payment is a test checkout until then.
- **SMS/WhatsApp provider** - alerts are a test send until a provider is connected.
- **Pilot school** - one real school to test end to end before opening registration.

## Costs (checked Nov 2026)

- Pilot: **$0** (GitHub free, Supabase Free, Vercel Hobby, no domain yet).
- Proper live: **~$45/month** (Vercel Pro $20 + Supabase Pro $25) + domain
  ~₦15,000/year. Paystack only takes a cut per payment (1.5% + ₦100,
  capped at ₦2,000, local).

<!-- Deploy note: sidebar active indicator + hyphen-only UI copy, 2026-11-20 -->
<!-- Deploy note: admissions fees and uploads, 2026-11-20 -->
<!-- Deploy note: Add to Home Screen PWA, 2026-11-20 -->
<!-- Deploy note: absence emails, 2026-11-20 -->
<!-- Deploy note: teacher reminders, 2026-11-20 -->
<!-- Deploy note: student profiling, 2026-11-20 -->
<!-- Deploy note: phone sidebar drawer, 2026-11-20 -->
