-- Digital SchoolVerse - migration 0014: student games, parent control
-- Run in the Supabase SQL editor AFTER 0013_my_profile_rpc.sql.
-- This migration does NOT edit 0001-0013.
--
-- What it does:
--   1. A new `parent_game_settings` table. A parent controls games
--      for their own child: 'weekend' (school rule - games open
--      Saturday and Sunday only), 'always' (open on weekdays too),
--      or 'blocked' (closed even on weekends). No row means the
--      school rule applies. One row per parent per child.
--   2. RLS: school-wide read (owner or own school, as in 0002);
--      insert/update/delete by the linked parent only (the parent
--      whose profile parent_id matches the row), or the platform
--      owner. A parent can never change another parent's setting.
--
-- No passwords, tokens or keys are added anywhere, and no new env
-- vars are needed. Games themselves are client-side only - no
-- scores are stored by this migration.

-- ---------------------------------------------------------------- table
create table if not exists public.parent_game_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  mode text not null check (mode in ('weekend', 'always', 'blocked')),
  updated_at timestamptz not null default now(),
  unique (parent_id, student_id)
);
create index if not exists parent_game_settings_student_idx
  on public.parent_game_settings (student_id);
create index if not exists parent_game_settings_parent_idx
  on public.parent_game_settings (parent_id);

alter table public.parent_game_settings enable row level security;

-- ---------------------------------------------------------------- RLS
-- Read: platform owner or anyone in the same school (0002 pattern).
drop policy if exists "game settings read" on public.parent_game_settings;
create policy "game settings read" on public.parent_game_settings
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Write: only the parent the row belongs to (their profile's
-- parent_id must match), or the platform owner. School must match
-- the parent's own school.
drop policy if exists "game settings write own child" on public.parent_game_settings;
create policy "game settings write own child" on public.parent_game_settings
  for all to authenticated
  using (
    public.is_platform_owner()
    or (
      parent_id = (select parent_id from public.profiles where id = auth.uid())
      and school_id = public.my_school_id()
    )
  )
  with check (
    public.is_platform_owner()
    or (
      parent_id = (select parent_id from public.profiles where id = auth.uid())
      and school_id = public.my_school_id()
    )
  );
