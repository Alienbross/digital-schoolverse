-- Digital SchoolVerse — migration 0010: logo-driven school branding
-- Run in the Supabase SQL editor AFTER 0009_student_profile_shares.sql.
-- This migration does NOT edit 0001-0009.
--
-- What it does:
--   1. Adds three columns to schools:
--        primary_color        - the portal primary colour for this school
--                               (hex #RRGGBB, or null = default Royal Blue
--                               #1D4ED8). Set from the logo or by the admin.
--        logo_color           - the colour last read from the school's logo
--                               by the client-side extractor (hex, or null
--                               when no logo / extraction failed).
--        primary_color_source - 'logo' when primary_color came from the
--                               logo, 'manual' when the admin picked it,
--                               null when the school uses the default.
--      A manual override is never overwritten by a later logo upload;
--      "reset to logo colour" copies logo_color into primary_color, and
--      "reset to default" clears primary_color. Sky #38BDF8 stays the
--      accent for every school - there is no secondary-colour column.
--   2. Updates the two public branding functions (school_by_slug from
--      0004 and school_branding from 0003) to also return primary_color
--      and logo_color, so a school's portal, sign-in page and manifest
--      can brand themselves before anyone signs in. They still return
--      branding fields only, never emails, phones, plan or status.
--      The functions are dropped and recreated because their return
--      type gains columns; nothing else depends on them.
--   3. No RLS change: the "schools update owner or own admin" policy
--      from migration 0002 already lets the platform owner and a
--      school's own school_admin update the school row, which covers
--      these columns.
--
-- Existing schools keep Royal Blue until their logo is re-uploaded
-- (the extractor runs at upload time) or the admin picks a colour in
-- School Setup - there is no server-side image processing to backfill
-- logo colours from logos already stored.

-- ---------------------------------------------------------------- columns
alter table public.schools
  add column if not exists primary_color text,
  add column if not exists logo_color text,
  add column if not exists primary_color_source text;

alter table public.schools
  add constraint schools_primary_color_hex
  check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.schools
  add constraint schools_logo_color_hex
  check (logo_color is null or logo_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.schools
  add constraint schools_primary_color_source
  check (primary_color_source is null or primary_color_source in ('logo', 'manual'));

-- ---------------------------------------------------------------- public slug lookup (0004, plus colours)
drop function if exists public.school_by_slug(text);

create function public.school_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  motto text,
  logo_url text,
  primary_color text,
  logo_color text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.slug, s.name, s.motto, s.logo_url, s.primary_color, s.logo_color
  from public.schools s
  where s.slug = p_slug;
$$;

grant execute on function public.school_by_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------- public branding lookup (0003, plus colours)
drop function if exists public.school_branding(uuid);

create function public.school_branding(p_school_id uuid)
returns table (
  name text,
  motto text,
  logo_url text,
  primary_color text,
  logo_color text
)
language sql stable security definer set search_path = public as $$
  select s.name, s.motto, s.logo_url, s.primary_color, s.logo_color
  from public.schools s
  where s.id = p_school_id;
$$;

grant execute on function public.school_branding(uuid) to anon, authenticated;
