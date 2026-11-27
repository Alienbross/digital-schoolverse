-- Digital SchoolVerse - migration 0022: teacher profiles for parents
-- Run in the Supabase SQL editor AFTER 0021 (or after 0014 if no
-- 0015-0021 exist yet - this migration does NOT edit 0001-0014).
--
-- What it does:
--   1. `teacher_profiles` - one short bio per teacher, written by
--      the teacher themself or the school admin. One row per teacher
--      (unique on teacher_id), so re-saving updates the same row.
--      `subjects_text` is a stored free-text fallback; the app
--      normally shows subjects taught from class_subjects + subjects.
--   2. RLS follows the 0002 school pattern (read: owner or own
--      school) plus the 0005 teacher pattern: the teacher themself
--      (profiles.teacher_id = teacher_profiles.teacher_id) and the
--      school admin may insert / update bios. Parents only read -
--      that is the point of the feature: parents see who teaches
--      their children, but never edit a teacher's bio.
--
-- No new environment variables. No email is sent anywhere here.

-- ---------------------------------------------------------------- table
create table if not exists public.teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  bio text null,
  subjects_text text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id)
);
create index if not exists teacher_profiles_school_idx
  on public.teacher_profiles(school_id);

alter table public.teacher_profiles enable row level security;

-- ---------------------------------------------------------------- RLS
-- Read: platform owner or anyone in the same school (0002 pattern).
create policy "teacher profiles read" on public.teacher_profiles
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Insert: the teacher themself, the school admin, or the owner.
create policy "teacher profiles insert" on public.teacher_profiles
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  );

-- Update: the teacher themself (their own row only), the school admin,
-- or the owner.
create policy "teacher profiles update" on public.teacher_profiles
  for update to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  )
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  );

-- Delete: school admin or owner only - a teacher cannot delete their
-- own profile row, only clear the bio text.
create policy "teacher profiles delete" on public.teacher_profiles
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
