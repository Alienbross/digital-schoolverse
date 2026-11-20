-- Digital SchoolVerse - migration 0009: student profile shares
-- Run in the Supabase SQL editor AFTER 0008_absence_emails.sql.
-- This migration does NOT edit 0001, 0002, 0003, 0004, 0005, 0006,
-- 0007 or 0008.
--
-- What it does:
--   1. A new `student_profile_shares` table. When the school admin
--      (or platform owner) shares a pupil's analysed profile summary
--      with the parent, one row is written: pupil, school, term,
--      who shared it, the plain-language summary text that was
--      shared, and when. The parent sees the shared summary in the
--      portal; a profile is only visible to a parent once it has
--      been shared (the app enforces this - see
--      src/components/workspace/student-profile.tsx).
--   2. The profile itself is read-only analysis - no table in this
--      migration changes a grade, an attendance mark or a fee. Every
--      figure in a profile is computed live from tables that already
--      exist (0001): attendance_records, score_records, fee_bills,
--      fee_payments, fee_online_payments, homework_assignments,
--      cbt_tests / cbt_attempts, clinic_visits, discipline_records,
--      complaints, bus_assignments / bus_routes, weekly_summaries.
--   3. RLS: school-wide read (owner or own school, as in 0002);
--      insert by the platform owner or the school admin only.
--      Parents read their own school's rows like every other school
--      table in 0002, and the parent workspace filters to shares for
--      their own linked children.
--
-- No passwords, tokens or keys are added anywhere, and no new env
-- vars are needed.

-- ---------------------------------------------------------------- table
create table if not exists public.student_profile_shares (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  term_id uuid references public.terms(id) on delete set null,
  shared_by uuid references public.profiles(id) on delete set null,
  summary_text text not null,
  shared_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists student_profile_shares_student_idx
  on public.student_profile_shares (student_id, shared_at desc);
create index if not exists student_profile_shares_school_idx
  on public.student_profile_shares (school_id, shared_at desc);

alter table public.student_profile_shares enable row level security;

-- ---------------------------------------------------------------- RLS
-- Read: platform owner or anyone in the same school (0002 pattern).
drop policy if exists "profile shares read" on public.student_profile_shares;
create policy "profile shares read" on public.student_profile_shares
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Insert: platform owner or the school admin only.
drop policy if exists "profile shares insert admin or owner" on public.student_profile_shares;
create policy "profile shares insert admin or owner" on public.student_profile_shares
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
