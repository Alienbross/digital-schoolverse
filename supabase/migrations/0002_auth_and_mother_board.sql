-- Digital SchoolVerse — migration 0002: Auth + Mother Board
-- Run in the Supabase SQL editor AFTER 0001_initial_schema.sql.
-- This migration does NOT edit 0001.
--
-- What it does:
--   1. Adds plan/status columns to schools (Mother Board plan control).
--   2. Adds `profiles` (auth user -> role -> school) and `invites`
--      (Mother Board / school-admin generated logins).
--   3. Replaces the pilot-only open RLS policy ("pilot open access",
--      anon could read/write everything) with auth-based policies:
--        - platform_owner: full access to everything.
--        - school users (school_admin / teacher / student / parent):
--          read only rows of their own school; only school_admin (and
--          the platform owner) may write school rows.
--        - anon: nothing, except reading a still-pending, unexpired
--          invite (needed so the invite-accept page can show it).
--   4. A user can only create their own profile row, and only for a
--      role/school that matches a pending invite sent to their email
--      (and never platform_owner). The platform-owner profile is
--      created by the owner in the SQL editor — see
--      docs/mother-board-setup.md. That is deliberate: nobody can
--      promote themselves to platform owner through the app.
--
-- NOTE: teacher / student / parent roles are read-only in this build.
-- Their full role dashboards (from the Muse portal) are a later port.
-- Email sending for invites is NOT wired yet: the Mother Board shows
-- the invite link and the owner shares it. The plug-in point is
-- documented in docs/mother-board-setup.md.

-- ---------------------------------------------------------------- schools: plan + status
alter table public.schools
  add column if not exists plan text not null default 'Basics'
    check (plan in ('Basics', 'Advanced'));
alter table public.schools
  add column if not exists status text not null default 'Trial'
    check (status in ('Trial', 'Active', 'Suspended'));

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null check (role in ('platform_owner', 'school_admin', 'teacher', 'student', 'parent')),
  school_id uuid references public.schools(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  parent_id uuid references public.parents(id) on delete set null,
  status text not null default 'Active' check (status in ('Active', 'Suspended')),
  created_at timestamptz not null default now(),
  -- platform owner has no school; every other role must belong to one
  check (role = 'platform_owner' or school_id is not null)
);

-- ---------------------------------------------------------------- invites
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text not null,
  role text not null check (role in ('school_admin', 'teacher', 'student', 'parent')),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_name text not null,
  teacher_id uuid references public.teachers(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  parent_id uuid references public.parents(id) on delete set null,
  status text not null default 'Pending'
    check (status in ('Pending', 'Accepted', 'Revoked', 'Expired')),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists invites_token_idx on public.invites(token);
create index if not exists invites_school_idx on public.invites(school_id, status);
create index if not exists invites_email_idx on public.invites(email, status);

-- ---------------------------------------------------------------- helpers (SECURITY DEFINER so they bypass RLS
-- and cannot recurse back into the policies that call them)
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_school_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'platform_owner'
  );
$$;

-- ---------------------------------------------------------------- drop the pilot open policy everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables
    where schemaname = 'public' and tablename not like 'pg_%'
  loop
    execute format('drop policy if exists "pilot open access" on %I', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS on the new tables
alter table public.profiles enable row level security;
alter table public.invites enable row level security;

-- profiles: read your own row, or everything if you are the owner
create policy "profiles read own or owner" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_owner());
-- profiles: create your own row only, only for a role/school matching a
-- pending invite sent to your email, and never platform_owner
create policy "profiles insert own via invite" on public.profiles
  for insert to authenticated
  with check (
    id = auth.uid()
    and role <> 'platform_owner'
    and exists (
      select 1 from public.invites i
      where i.email = (auth.jwt() ->> 'email')
        and i.school_id = profiles.school_id
        and i.role = profiles.role
        and i.status = 'Pending'
        and i.expires_at > now()
    )
  );
-- profiles: update your own row (without escalating role/school) or any row as owner
create policy "profiles update own or owner" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_platform_owner())
  with check (
    public.is_platform_owner()
    or (role = public.my_role() and school_id = public.my_school_id())
  );
-- profiles: delete only as owner
create policy "profiles delete owner only" on public.profiles
  for delete to authenticated
  using (public.is_platform_owner());

-- invites: anyone may read a still-pending, unexpired invite (accept page)
create policy "invites read pending" on public.invites
  for select to anon
  using (status = 'Pending' and expires_at > now());
-- invites: owner sees all; school admin sees own school's; anyone sees
-- invites sent to their own email
create policy "invites read owner school or self" on public.invites
  for select to authenticated
  using (
    public.is_platform_owner()
    or school_id = public.my_school_id()
    or email = (auth.jwt() ->> 'email')
  );
-- invites: owner creates any; school admin creates for own school (never owner role)
create policy "invites insert owner or school admin" on public.invites
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
-- invites: owner or own-school admin or the invitee may update (accept / revoke)
create policy "invites update owner school or self" on public.invites
  for update to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or email = (auth.jwt() ->> 'email')
  )
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or email = (auth.jwt() ->> 'email')
  );
-- invites: delete only as owner
create policy "invites delete owner only" on public.invites
  for delete to authenticated
  using (public.is_platform_owner());

-- ---------------------------------------------------------------- RLS on schools
-- (schools has no school_id column, so it gets its own policies)
create policy "schools read owner or own" on public.schools
  for select to authenticated
  using (public.is_platform_owner() or id = public.my_school_id());
create policy "schools insert owner only" on public.schools
  for insert to authenticated
  with check (public.is_platform_owner());
create policy "schools update owner or own admin" on public.schools
  for update to authenticated
  using (
    public.is_platform_owner()
    or (id = public.my_school_id() and public.my_role() = 'school_admin')
  )
  with check (
    public.is_platform_owner()
    or (id = public.my_school_id() and public.my_role() = 'school_admin')
  );
create policy "schools delete owner only" on public.schools
  for delete to authenticated
  using (public.is_platform_owner());

-- ---------------------------------------------------------------- RLS on the 26 tables that carry school_id
-- read: owner or own school. write: owner or own school's school_admin.
do $$
declare t text;
begin
  for t in select unnest(array[
    'branches', 'terms', 'classes', 'subjects', 'teachers', 'students',
    'parents', 'attendance_records', 'score_records', 'fee_bills',
    'fee_payments', 'fee_online_payments', 'complaints',
    'homework_assignments', 'timetable_slots', 'announcements',
    'message_threads', 'admission_applications', 'ai_drafts',
    'cbt_tests', 'parent_alerts', 'weekly_summaries', 'bus_routes',
    'clinic_visits', 'discipline_records', 'report_card_templates'
  ]) loop
    execute format(
      'create policy "school read" on %I for select to authenticated '
      'using (public.is_platform_owner() or school_id = public.my_school_id())', t);
    execute format(
      'create policy "school insert" on %I for insert to authenticated '
      'with check (public.is_platform_owner() or '
      '(school_id = public.my_school_id() and public.my_role() = ''school_admin''))', t);
    execute format(
      'create policy "school update" on %I for update to authenticated '
      'using (public.is_platform_owner() or '
      '(school_id = public.my_school_id() and public.my_role() = ''school_admin'')) '
      'with check (public.is_platform_owner() or '
      '(school_id = public.my_school_id() and public.my_role() = ''school_admin''))', t);
    execute format(
      'create policy "school delete" on %I for delete to authenticated '
      'using (public.is_platform_owner() or '
      '(school_id = public.my_school_id() and public.my_role() = ''school_admin''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS on tables linked to a school through another table
-- class_subjects -> classes.school_id
create policy "class_subjects read" on public.class_subjects
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (select 1 from public.classes c
               where c.id = class_subjects.class_id
                 and c.school_id = public.my_school_id())
  );
create policy "class_subjects write" on public.class_subjects
  for all to authenticated
  using (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.classes c
                    where c.id = class_subjects.class_id
                      and c.school_id = public.my_school_id()))
  )
  with check (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.classes c
                    where c.id = class_subjects.class_id
                      and c.school_id = public.my_school_id()))
  );

-- parent_children -> parents.school_id
create policy "parent_children read" on public.parent_children
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (select 1 from public.parents p
               where p.id = parent_children.parent_id
                 and p.school_id = public.my_school_id())
  );
create policy "parent_children write" on public.parent_children
  for all to authenticated
  using (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.parents p
                    where p.id = parent_children.parent_id
                      and p.school_id = public.my_school_id()))
  )
  with check (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.parents p
                    where p.id = parent_children.parent_id
                      and p.school_id = public.my_school_id()))
  );

-- messages -> message_threads.school_id
create policy "messages read" on public.messages
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (select 1 from public.message_threads t
               where t.id = messages.thread_id
                 and t.school_id = public.my_school_id())
  );
create policy "messages write" on public.messages
  for all to authenticated
  using (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.message_threads t
                    where t.id = messages.thread_id
                      and t.school_id = public.my_school_id()))
  )
  with check (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.message_threads t
                    where t.id = messages.thread_id
                      and t.school_id = public.my_school_id()))
  );

-- cbt_questions -> cbt_tests.school_id
create policy "cbt_questions read" on public.cbt_questions
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (select 1 from public.cbt_tests t
               where t.id = cbt_questions.test_id
                 and t.school_id = public.my_school_id())
  );
create policy "cbt_questions write" on public.cbt_questions
  for all to authenticated
  using (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.cbt_tests t
                    where t.id = cbt_questions.test_id
                      and t.school_id = public.my_school_id()))
  )
  with check (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.cbt_tests t
                    where t.id = cbt_questions.test_id
                      and t.school_id = public.my_school_id()))
  );

-- cbt_attempts -> cbt_tests.school_id
create policy "cbt_attempts read" on public.cbt_attempts
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (select 1 from public.cbt_tests t
               where t.id = cbt_attempts.test_id
                 and t.school_id = public.my_school_id())
  );
create policy "cbt_attempts write" on public.cbt_attempts
  for all to authenticated
  using (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.cbt_tests t
                    where t.id = cbt_attempts.test_id
                      and t.school_id = public.my_school_id()))
  )
  with check (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.cbt_tests t
                    where t.id = cbt_attempts.test_id
                      and t.school_id = public.my_school_id()))
  );

-- bus_assignments -> students.school_id
create policy "bus_assignments read" on public.bus_assignments
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (select 1 from public.students s
               where s.id = bus_assignments.student_id
                 and s.school_id = public.my_school_id())
  );
create policy "bus_assignments write" on public.bus_assignments
  for all to authenticated
  using (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.students s
                    where s.id = bus_assignments.student_id
                      and s.school_id = public.my_school_id()))
  )
  with check (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.students s
                    where s.id = bus_assignments.student_id
                      and s.school_id = public.my_school_id()))
  );

-- bus_attendance -> bus_routes.school_id
create policy "bus_attendance read" on public.bus_attendance
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (select 1 from public.bus_routes r
               where r.id = bus_attendance.route_id
                 and r.school_id = public.my_school_id())
  );
create policy "bus_attendance write" on public.bus_attendance
  for all to authenticated
  using (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.bus_routes r
                    where r.id = bus_attendance.route_id
                      and r.school_id = public.my_school_id()))
  )
  with check (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin'
        and exists (select 1 from public.bus_routes r
                    where r.id = bus_attendance.route_id
                      and r.school_id = public.my_school_id()))
  );
