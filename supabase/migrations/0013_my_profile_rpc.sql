-- Digital SchoolVerse - migration 0013: own-profile RPC fallback
-- Run in the Supabase SQL editor AFTER 0012_domain_assessments.sql.
-- This migration does NOT edit 0001-0012.
--
-- What it does:
--   1. `public.my_profile()` - SECURITY DEFINER function returning
--      the caller's own row from public.profiles (id = auth.uid()).
--      The app reads a profile with a direct query first and only
--      falls back to this RPC when that read returns nothing, so a
--      signed-in user whose row exists is never shown
--      "Account not set up yet" because of an RLS read edge.
--      The function can only ever return the caller's own row.
--
-- No new environment variables. No email is sent anywhere here.

-- ---------------------------------------------------------------- my_profile
create or replace function public.my_profile()
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;

grant execute on function public.my_profile() to authenticated;
