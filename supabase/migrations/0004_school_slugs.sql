-- Digital SchoolVerse — migration 0004: per-school path URLs
-- Run in the Supabase SQL editor AFTER 0003_school_logos.sql.
-- This migration does NOT edit 0001, 0002 or 0003.
--
-- What it does:
--   1. Adds a unique `slug` to schools — the school's short name, e.g.
--      "greenfield", which becomes its path address:
--      digital-schoolverse.vercel.app/greenfield
--      Lowercase letters, numbers and hyphens only; reserved words that
--      would clash with real routes (login, invite, mother-board, the
--      workspace page names, …) are rejected.
--   2. Backfills a slug for every school that already exists, derived
--      from its name ("Greenfield Academy" -> "greenfield-academy"),
--      with a -2, -3, … suffix when two schools would collide.
--   3. Adds a public `school_by_slug(slug)` function (like the
--      `school_branding()` function from migration 0003) so the app can
--      resolve a path slug to a school before anyone signs in — it
--      returns id, slug, name, motto and logo_url only, never emails,
--      phones, plan or status.
--
-- School scoping is unchanged: RLS from migration 0002 still decides
-- what a signed-in user may read or write. The slug only picks which
-- school's portal the URL points at; a user who belongs to another
-- school still cannot see its data.

-- ---------------------------------------------------------------- slug column
alter table public.schools
  add column if not exists slug text;

-- Slugify a name: lowercase, non-alphanumerics become one hyphen,
-- leading/trailing hyphens trimmed, empty result becomes "school".
create or replace function public.slugify_name(p_name text)
returns text
language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_name, ''))), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ), '')
  ;
$$;

-- Backfill slugs for existing schools, de-duplicated with -2, -3, …
do $$
declare
  r record;
  base_slug text;
  candidate text;
  n integer;
begin
  for r in select id, name from public.schools where slug is null loop
    base_slug := coalesce(public.slugify_name(r.name), 'school');
    candidate := base_slug;
    n := 2;
    while exists (select 1 from public.schools where slug = candidate) loop
      candidate := base_slug || '-' || n;
      n := n + 1;
    end loop;
    update public.schools set slug = candidate where id = r.id;
  end loop;
end $$;

alter table public.schools
  alter column slug set not null;

-- Reserved words: names that would clash with real routes. The app
-- validates the same list before saving (see src/lib/slug.ts).
alter table public.schools
  add constraint schools_slug_format
  check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 50
    and slug not in (
      'login', 'invite', 'reset-password', 'mother-board', 'api', '_next',
      'setup', 'classes', 'subjects', 'students', 'teachers', 'parents',
      'plan', 'favicon.ico', 'admin', 'dashboard', 'school', 'schools'
    )
  );

create unique index if not exists schools_slug_unique
  on public.schools (slug);

-- ---------------------------------------------------------------- public slug lookup
create or replace function public.school_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  motto text,
  logo_url text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.slug, s.name, s.motto, s.logo_url
  from public.schools s
  where s.slug = p_slug;
$$;

grant execute on function public.school_by_slug(text) to anon, authenticated;
