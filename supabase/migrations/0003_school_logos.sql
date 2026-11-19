-- Digital SchoolVerse — migration 0003: school logos
-- Run in the Supabase SQL editor AFTER 0002_auth_and_mother_board.sql.
-- This migration does NOT edit 0001 or 0002.
--
-- What it does:
--   1. Creates a public Supabase Storage bucket `school-logos` for school
--      logo images (PNG / JPG / WebP, max 2 MB). Files are stored at
--      `<school_id>/logo.<ext>` — one logo per school; re-uploading with
--      a different extension replaces it.
--   2. Storage policies: anyone may READ a logo (they are public branding,
--      shown on the school portal, login page and report cards); only the
--      platform owner, or that school's own school_admin, may upload,
--      replace or delete that school's logo.
--   3. Adds a public branding function `school_branding(school_id)` that
--      returns only a school's name, motto and logo_url. The login and
--      invite-accept pages are public (signed-out) pages, so they cannot
--      read the schools table under RLS — they call this function instead
--      to show the school's logo before sign-in. It returns branding
--      fields only, never emails, phones or plan/status.
--
-- NOTE: `schools.logo_url` already exists (migration 0001). Uploading a
-- logo writes its public Storage URL into that column; removing a logo
-- clears it. Nothing else changes.

-- ---------------------------------------------------------------- bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-logos',
  'school-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- ---------------------------------------------------------------- storage policies
-- Public read: logos are school branding, shown to everyone who opens
-- that school's portal, login page or a report card.
drop policy if exists "school logos public read" on storage.objects;
create policy "school logos public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'school-logos');

-- Upload: platform owner (any school) or the school's own school_admin.
-- The file path's first folder must be the school's id.
drop policy if exists "school logos upload owner or own admin" on storage.objects;
create policy "school logos upload owner or own admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'school-logos'
    and (
      public.is_platform_owner()
      or (
        public.my_role() = 'school_admin'
        and public.my_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

-- Replace: same rule as upload.
drop policy if exists "school logos update owner or own admin" on storage.objects;
create policy "school logos update owner or own admin" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'school-logos'
    and (
      public.is_platform_owner()
      or (
        public.my_role() = 'school_admin'
        and public.my_school_id()::text = (storage.foldername(name))[1]
      )
    )
  )
  with check (
    bucket_id = 'school-logos'
    and (
      public.is_platform_owner()
      or (
        public.my_role() = 'school_admin'
        and public.my_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

-- Delete: same rule as upload.
drop policy if exists "school logos delete owner or own admin" on storage.objects;
create policy "school logos delete owner or own admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'school-logos'
    and (
      public.is_platform_owner()
      or (
        public.my_role() = 'school_admin'
        and public.my_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

-- ---------------------------------------------------------------- public branding lookup
-- Signed-out pages (login, invite accept) need the school's logo before
-- anyone signs in. This function returns branding fields only.
create or replace function public.school_branding(p_school_id uuid)
returns table (name text, motto text, logo_url text)
language sql
security definer
stable
as $$
  select s.name, s.motto, s.logo_url
  from public.schools s
  where s.id = p_school_id;
$$;

grant execute on function public.school_branding(uuid) to anon, authenticated;
