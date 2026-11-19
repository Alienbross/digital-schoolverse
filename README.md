# Digital SchoolVerse — Live Pilot (free tier)

Real code for the Digital SchoolVerse school portal: **Next.js 16 (App Router)
+ Tailwind CSS v4 + Supabase (PostgreSQL)**. Royal Blue `#1D4ED8` + Sky
`#38BDF8`, light default theme. This is the go-live build — the Muse portal
artifact (`digital-schoolverse-portal`) was the working prototype; this repo
is the real app that can be deployed and shared.

## What is in this pilot

- **Foundation + Admin core** (live): Overview with setup checklist and live
  counts, School Setup (profile, sessions & terms), Classes & Arms (with
  branches), Subjects (per-class assignments + subject teachers), Students
  register (auto admission numbers `DSV/2026/0001…`, search), Teachers &
  Staff, Parents (parent–child linking, siblings share one parent), Plan &
  Roadmap page.
- **Supabase schema** in `supabase/migrations/0001_initial_schema.sql` —
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
  portal and are ported next, in that order — see `src/app/plan/page.tsx`.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

Without env vars the app still builds and runs, but shows a
“Supabase not connected yet” banner and empty registers — nothing is saved.

## Set up Supabase (free tier — $0)

1. Create a project at supabase.com (free tier; it pauses after a week idle —
   fine for the pilot, move to Pro $25/mo before charging schools).
2. In the Supabase SQL editor, run
   `supabase/migrations/0001_initial_schema.sql`, then
   `supabase/migrations/0002_auth_and_mother_board.sql`, then
   `supabase/migrations/0003_school_logos.sql` (school logos bucket).
3. Copy the project URL + anon key (Settings → API) into `.env.local`.

## Auth + Mother Board (live in this build)

- **Sign-in** at `/login` (Supabase Auth, email + password). Roles:
  `platform_owner` (Mother Board, full control), `school_admin` (own
  school only), `teacher` / `student` / `parent` (read-only for now —
  their full dashboards are ported next).
- **Mother Board** at `/mother-board`: Overview, Schools (create /
  suspend / delete, plan Basics/Advanced), School Control (per-school
  people + generate logins), Logins & People (suspend, reset password,
  delete), Invites, Analytics, Plans, Support (complaints, urgent
  first), Access Model.
- **Invites**: generating an invite creates a record with a token and
  a 7-day expiry; the invite link is `/invite/<token>`. The invitee
  sets a password and logs in. **No email is sent by the app yet** —
  the Mother Board shows the link and the owner shares it.
- **First owner login**: create the user in Supabase → Authentication
  → Users, then insert their `profiles` row with role
  `platform_owner` in the SQL editor. Full steps in
  `docs/mother-board-setup.md`.
- **Light / Dark theme**: toggle in the header on every page (Light
  default `#F8FAFC`, Dark deep navy `#0B1220`), choice saved.

> **Security:** migration 0002 replaces the pilot open RLS policy with
> auth-based policies — platform owner sees everything, school users
> see only their own school, and only the owner / school admin may
> write school data. The owner profile can only be created in the SQL
> editor, never through the app.

## Deploy (free pilot)

1. Push this folder to GitHub (repo under the owner's name — still needed).
2. Import the repo in Vercel (Hobby plan, $0 — personal/non-commercial
   only; Pro $20/mo for the live business site).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
   Vercel → Project Settings → Environment Variables.
4. Deploy. Vercel gives a `*.vercel.app` link to share with the pilot
   school; add the bought domain (e.g. `app.digitalschoolverse.com`,
   ~₦14,000–₦18,000/year for .com) later in Vercel → Domains.

## What still needs the user

- **Run migration 0002** in the Supabase SQL editor (see above) —
  until then the live site still works the old unauthenticated way.
- **Create the platform-owner login** (Supabase Dashboard + one SQL
  insert) — see `docs/mother-board-setup.md`.
- **Pilot school** — one real school to test end to end before opening registration.
- **Domain** — not bought yet.
- **Paystack live keys** — online fee payment is a test checkout until then.
- **SMS/WhatsApp provider** — alerts are a test send until a provider is connected.
- **Pilot school** — one real school to test end to end before opening registration.

## Costs (checked Nov 2026)

- Pilot: **$0** (GitHub free, Supabase Free, Vercel Hobby, no domain yet).
- Proper live: **~$45/month** (Vercel Pro $20 + Supabase Pro $25) + domain
  ~₦15,000/year. Paystack only takes a cut per payment (1.5% + ₦100,
  capped at ₦2,000, local).
