-- Digital SchoolVerse - migration 0028: fix parent_game_settings RLS recursion
-- Run in the Supabase SQL editor AFTER 0027_notify_rpc_and_slugs.sql.
-- This migration does NOT edit 0001-0027.
--
-- The bug: migration 0014 gave parent_game_settings a write policy
-- ("game settings write own child") that proved the caller with a
-- direct subquery on public.profiles:
--   parent_id = (select parent_id from public.profiles where id = auth.uid())
-- Live, saving a parent's game setting fails with "infinite recursion
-- detected in policy for relation profiles", because profiles has a
-- self-referencing SELECT policy, so any profiles subquery inside
-- another policy recurses back into profiles policies.
--
-- The fix: never query public.profiles directly from a policy. Use
-- the SECURITY DEFINER helpers, which read profiles while bypassing
-- RLS and so cannot recurse (the same pattern as my_profile() in
-- 0013 and my_role() / my_school_id() in 0002):
--   1. public.my_parent_id() (already exists, from 0005) returns the
--      caller's parent_id.
--   2. public.is_parent_of(student_id) (new here) returns true when
--      the caller is linked to that pupil in parent_children. The
--      check runs inside the SECURITY DEFINER function, so it never
--      evaluates parent_children or profiles policies.
-- The read policy is untouched: it only calls is_platform_owner()
-- and my_school_id(), both SECURITY DEFINER, so it does not recurse.
--
-- No passwords, tokens or keys are added anywhere, and no new env
-- vars are needed.

-- ---------------------------------------------------------------- helper
create or replace function public.is_parent_of(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.parent_children pc
    join public.profiles pr on pr.parent_id = pc.parent_id
    where pr.id = auth.uid()
      and pc.student_id = p_student_id
  );
$$;

grant execute on function public.is_parent_of(uuid) to authenticated;

-- ---------------------------------------------------------------- RLS fix
-- Write: only the parent the row belongs to - their parent_id must
-- match, and they must be linked to the pupil in parent_children -
-- or the platform owner. School must match the parent's own school.
drop policy if exists "game settings write own child" on public.parent_game_settings;
create policy "game settings write own child" on public.parent_game_settings
  for all to authenticated
  using (
    public.is_platform_owner()
    or (
      parent_id = public.my_parent_id()
      and public.is_parent_of(student_id)
      and school_id = public.my_school_id()
    )
  )
  with check (
    public.is_platform_owner()
    or (
      parent_id = public.my_parent_id()
      and public.is_parent_of(student_id)
      and school_id = public.my_school_id()
    )
  );
