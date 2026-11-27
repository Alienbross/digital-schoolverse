-- Digital SchoolVerse - migration 0024: sickbay and emergency alerts
-- Run in the Supabase SQL editor AFTER 0023 (if any) / 0014.
-- This migration does NOT edit 0001-0014.
--
-- What it does:
--   1. `sickbay_events` - one row per sickbay visit, child sent home,
--      or emergency, recorded by the school admin or a teacher.
--      This is an alert record only. It is NOT the clinic_visits or
--      discipline_records table from migration 0001 - those are
--      different records and are left untouched.
--   2. RLS follows the 0002 / 0012 school pattern: same-school
--      authenticated users can read; the school admin and teachers
--      can insert. The parent alert itself is an in-portal row in
--      the existing `notifications` table (migration 0006), written
--      by src/lib/sickbay.ts - no SMS is sent here.
--
-- No new environment variables. No SMS or email is sent anywhere here.

-- ---------------------------------------------------------------- 1. table
create table if not exists public.sickbay_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('Sickbay', 'Sent home', 'Emergency')),
  note text,
  recorded_by uuid,
  recorded_at timestamptz not null default now()
);
create index if not exists sickbay_events_school_idx
  on public.sickbay_events(school_id, recorded_at desc);
create index if not exists sickbay_events_student_idx
  on public.sickbay_events(student_id, recorded_at desc);

alter table public.sickbay_events enable row level security;

-- ---------------------------------------------------------------- 2. RLS
-- Read: the platform owner or anyone in the same school.
create policy "sickbay school read" on public.sickbay_events
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Insert: the platform owner, the school admin, or a teacher in the
-- same school.
create policy "sickbay school insert" on public.sickbay_events
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and public.my_role() = 'teacher')
  );
