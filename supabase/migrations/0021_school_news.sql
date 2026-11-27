-- Digital SchoolVerse - migration 0021: school news (news / advert column)
-- Run in the Supabase SQL editor AFTER 0020 (or after the latest
-- migration you have applied). This migration does NOT edit 0001-0020.
--
-- What it does:
--   1. `school_news` - the school news / advert column: ONE feature,
--      not two. The school admin posts news (title, body, optional
--      picture) and picks who sees it: everybody in the school,
--      parents of particular classes, or teachers only. Everybody
--      sees it in their app and gets an in-app notification to check
--      it. This is a NEW feature - the `announcements` table from
--      migration 0001 is a different, older feature and is untouched.
--   2. RLS follows the 0002 school pattern: same-school authenticated
--      users can read; only the school's school_admin (or the
--      platform owner) can insert / update / delete. Audience
--      scoping (who actually sees which row) is done in the app
--      (src/lib/news.ts), on top of this same-school read.
--   3. Reserves "news" as a school slug (like 0005 reserved the
--      workspace words), so no school path can clash with the
--      /news and /<slug>/news routes.
--
-- Pictures: news pictures reuse the `school-logos` Storage bucket
-- from migration 0003, under `<school_id>/news/<uuid>.<ext>`. The
-- 0003 storage policies already allow exactly that: public read,
-- and upload / replace / delete by the platform owner or that
-- school's own school_admin (first folder must be the school id).
-- No new bucket and no new storage policy is needed here.

-- ---------------------------------------------------------------- 1. table
create table if not exists public.school_news (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  body text not null,
  image_url text,
  audience_type text not null check (audience_type in ('everybody', 'parents_of_classes', 'teachers_only')),
  class_ids uuid[] not null default '{}',
  status text not null default 'Published',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists school_news_school_idx
  on public.school_news(school_id, created_at desc);

alter table public.school_news enable row level security;

-- ---------------------------------------------------------------- 2. RLS - school pattern (0002 / 0012)
create policy "school news read" on public.school_news
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());
create policy "school news insert" on public.school_news
  for insert to authenticated
  with check (public.is_platform_owner() or
    (school_id = public.my_school_id() and public.my_role() = 'school_admin'));
create policy "school news update" on public.school_news
  for update to authenticated
  using (public.is_platform_owner() or
    (school_id = public.my_school_id() and public.my_role() = 'school_admin'))
  with check (public.is_platform_owner() or
    (school_id = public.my_school_id() and public.my_role() = 'school_admin'));
create policy "school news delete" on public.school_news
  for delete to authenticated
  using (public.is_platform_owner() or
    (school_id = public.my_school_id() and public.my_role() = 'school_admin'));

-- ---------------------------------------------------------------- 3. reserve the route word as a slug
-- (Same approach as 0005: re-create the check with one more word.)
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
      'teacher', 'student', 'parent', 'news'
    )
  );
