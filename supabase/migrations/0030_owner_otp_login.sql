-- Digital SchoolVerse - migration 0030: platform-owner OTP login
--
--   The platform owner kept getting "Invalid login credentials" after
--   time away - the password saved in the browser was a stale wrong
--   one from an earlier vault-filled account creation, and the owner
--   is done with passwords. The owner now signs in with no password
--   at all: email + a 6-digit code sent by Supabase Auth
--   (signInWithOtp / verifyOtp, type 'email').
--
--   What it does:
--   1. `public.is_platform_owner_email(p_email)` - SECURITY DEFINER
--      function returning true only when a profiles row with that
--      email (exact match, case-insensitive) has role
--      platform_owner. The app calls it BEFORE sending any code, so
--      a code is only ever sent to the owner email. The app shows the
--      same plain message whether the email is an owner email or not,
--      so the function alone leaks nothing to the screen.
--      Granted to anon (it must run before sign-in) and authenticated.
--   2. Reserves 'owner' as a school slug, so no school path can ever
--      swallow the /owner/login route (same drop-and-recreate pattern
--      as migration 0027; list copied from 0027 plus 'owner').
--
-- No password is changed, no account is deleted or created here.
-- No new environment variables. The OTP email itself comes from
-- Supabase Auth - no custom email provider is needed. Note: the
-- Supabase dashboard must have Email OTP enabled for the email to
-- carry a 6-digit code instead of a magic link (Auth > Providers >
-- Email in the dashboard); that toggle is outside this migration.

-- ------------------------------------------------ is_platform_owner_email
create or replace function public.is_platform_owner_email(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where lower(email) = lower(p_email)
      and role = 'platform_owner'
  );
$$;

grant execute on function public.is_platform_owner_email(text) to anon, authenticated;

-- ------------------------------------------------ reserve 'owner' as a slug
alter table public.schools drop constraint if exists schools_slug_format;
alter table public.schools
  add constraint schools_slug_format
  check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 50
    and slug not in (
      'login', 'invite', 'reset-password', 'mother-board', 'api', '_next',
      'setup', 'classes', 'subjects', 'students', 'teachers', 'parents',
      'plan', 'favicon.ico', 'admin', 'dashboard', 'school', 'schools',
      'teacher', 'student', 'parent', 'news',
      'votes', 'teacher-profiles', 'my-bio', 'student-bio', 'sickbay',
      'summaries', 'homework-reminders', 'games', 'owner'
    )
  );
