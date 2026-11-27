-- Digital SchoolVerse - migration 0029: parent profile ids for a pupil
--
--   Bug fix (live test 2026-11-27): a sickbay event recorded for a
--   pupil said "no linked parent with a login to alert in-portal"
--   even though the parent was linked and had a login. Cause: the
--   `profiles` table only lets a user read their own row ("profiles
--   read own or owner", migration 0002), so the school admin's
--   client-side lookup `profiles ... where parent_id in (...)`
--   in src/lib/sickbay.ts always returned zero rows under RLS and
--   the alert was silently skipped. The `parent_children` read
--   itself was fine, and the notify_recipients RPC (0027) was fine
--   - only the profile-id resolution in between was blocked.
--
--   Fix: resolve the linked parents' login (profile) ids inside
--   this SECURITY DEFINER function, which runs past RLS, and let
--   src/lib/sickbay.ts call it instead of reading `profiles`
--   directly. The function only answers for a pupil in the
--   caller's own school (or for the platform owner), only for
--   Approved links (Pending / Rejected links are never notified,
--   same rule as migration 0006), and only for Active logins.
create or replace function public.parent_profile_ids_for_student(p_student_id uuid)
returns setof uuid
language sql security definer set search_path = public as $$
  select p.id
  from public.profiles p
  join public.parent_children pc on pc.parent_id = p.parent_id
  join public.students s on s.id = pc.student_id
  where pc.student_id = p_student_id
    and pc.status is distinct from 'Pending'
    and pc.status is distinct from 'Rejected'
    and p.status = 'Active'
    and (
      public.is_platform_owner()
      or s.school_id = public.my_school_id()
    );
$$;

grant execute on function public.parent_profile_ids_for_student(uuid) to authenticated;
