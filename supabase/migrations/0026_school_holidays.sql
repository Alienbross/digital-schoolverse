-- Digital SchoolVerse - migration 0026: school holidays
-- Run in the Supabase SQL editor AFTER 0025_monthly_summaries.sql.
-- This migration does NOT edit 0001-0025.
--
-- What it does:
--   1. `school_holidays` - the dates the school is closed (public
--      holidays and school-declared closures). One row per school
--      per date. Homework due dates and evening reminders skip
--      these days and shift to the next school day - see
--      src/lib/homework-reminders.ts.
--   2. RLS follows the 0002 / 0012 school pattern: same-school
--      authenticated users can read; the school admin can insert
--      and delete.
--
-- No new environment variables. No email or SMS is sent anywhere here.

-- ---------------------------------------------------------------- 1. table
create table if not exists public.school_holidays (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  holiday_date date not null,
  label text,
  created_at timestamptz not null default now(),
  unique (school_id, holiday_date)
);
create index if not exists school_holidays_school_idx
  on public.school_holidays(school_id, holiday_date);

alter table public.school_holidays enable row level security;

-- ---------------------------------------------------------------- 2. RLS
-- Read: the platform owner or anyone in the same school.
create policy "school holidays read" on public.school_holidays
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Insert / delete: the platform owner or the school admin only.
create policy "school holidays insert" on public.school_holidays
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
create policy "school holidays delete" on public.school_holidays
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
