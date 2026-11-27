-- Digital SchoolVerse - migration 0025: monthly assessment summaries
-- Run in the Supabase SQL editor AFTER 0024_sickbay_alerts.sql.
-- This migration does NOT edit 0001-0024.
--
-- What it does:
--   1. `monthly_summaries` - one summary per pupil per month, the
--      monthly companion to `weekly_summaries` (migration 0001,
--      which already exists and is NOT recreated here). Unique on
--      (student_id, month_start), so re-saving updates the same row
--      - never duplicates. Summaries start as Draft and are only
--      visible to parents once marked Shared.
--   2. RLS follows the 0002 / 0012 school pattern: same-school
--      authenticated users can read; the school admin and teachers
--      can insert and update.
--
-- No new environment variables. No email or SMS is sent anywhere here.

-- ---------------------------------------------------------------- 1. table
create table if not exists public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  month_start date not null,
  summary_text text not null,
  status text not null default 'Draft',
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, month_start)
);
create index if not exists monthly_summaries_school_idx
  on public.monthly_summaries(school_id, month_start desc);
create index if not exists monthly_summaries_student_idx
  on public.monthly_summaries(student_id, month_start desc);

alter table public.monthly_summaries enable row level security;

-- ---------------------------------------------------------------- 2. RLS
-- Read: the platform owner or anyone in the same school.
create policy "monthly summaries school read" on public.monthly_summaries
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Insert: the platform owner, the school admin, or a teacher in the
-- same school.
create policy "monthly summaries school insert" on public.monthly_summaries
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and public.my_role() = 'teacher')
  );

-- Update: same writers as insert (Draft to Shared, or a re-save).
create policy "monthly summaries school update" on public.monthly_summaries
  for update to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and public.my_role() = 'teacher')
  )
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and public.my_role() = 'teacher')
  );
