-- Digital SchoolVerse - migration 0023: student bios
-- Run in the Supabase SQL editor AFTER 0022_teacher_profiles.sql.
-- This migration does NOT edit 0001-0022.
--
-- What it does:
--   1. `student_bios` - one bio per pupil, filled in by the pupil
--      themself: club, interest, sport, ambition and favourite
--      colour. One row per pupil (unique on student_id), so
--      re-saving updates the same row.
--   2. The class teacher is NOT stored here - it is shown from the
--      pupil's class (classes.class_teacher_id) and never edited
--      in the bio.
--   3. RLS follows the 0002 school pattern (read: owner or own
--      school) plus the 0005 student pattern: the pupil themself
--      (profiles.student_id = student_bios.student_id) may insert /
--      update their own row; the school admin may also update it.
--      Parents only read their own children's bios in the app.
--
-- No new environment variables. No email is sent anywhere here.

-- ---------------------------------------------------------------- table
create table if not exists public.student_bios (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  club text null,
  interest text null,
  sport text null,
  ambition text null,
  favourite_colour text null,
  updated_at timestamptz not null default now(),
  unique (student_id)
);
create index if not exists student_bios_school_idx
  on public.student_bios(school_id);

alter table public.student_bios enable row level security;

-- ---------------------------------------------------------------- RLS
-- Read: platform owner or anyone in the same school (0002 pattern).
create policy "student bios read" on public.student_bios
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Insert: the pupil themself (their own row only), or the owner.
create policy "student bios insert" on public.student_bios
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and student_id = public.my_student_id())
  );

-- Update: the pupil themself (their own row only), the school admin,
-- or the owner.
create policy "student bios update" on public.student_bios
  for update to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and student_id = public.my_student_id())
  )
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and student_id = public.my_student_id())
  );

-- Delete: school admin or owner only - a pupil cannot delete their
-- own bio row, only clear its fields.
create policy "student bios delete" on public.student_bios
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
