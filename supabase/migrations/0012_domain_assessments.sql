-- Digital SchoolVerse - migration 0012: affective & psychomotor assessments
-- Run in the Supabase SQL editor AFTER 0011_login_registration_revamp.sql.
-- This migration does NOT edit 0001-0011.
--
-- What it does:
--   1. `assessment_traits` - the traits (affective) and skills
--      (psychomotor) a school rates each pupil on, 1-5. The admin
--      edits this list in School Setup; sensible defaults are seeded
--      per school by `ensure_default_assessment_traits` the first
--      time the list is opened (a school with no rows yet gets the
--      defaults). Removing a trait hides it from future entry only -
--      it sets is_active = false, so ratings already saved stay on
--      past report cards.
--   2. `domain_assessments` - one rating per pupil, per term, per
--      trait. Unique on (student_id, term_id, trait_id), so re-saving
--      updates the same row - never duplicates. trait_name is stored
--      on the row too, so a later rename does not rewrite history.
--   3. `domain_assessment_comments` - one free-text comment per
--      pupil, per term, per domain (affective / psychomotor).
--   4. RLS follows the 0002 school pattern (read: owner or own
--      school; write: owner or own school's school_admin) plus the
--      0005/0006 teacher pattern: an Active teacher may insert /
--      update ratings and comments only for a class they teach
--      (`i_teach_class`, which also covers classes picked at
--      registration - migration 0011).
--
-- No new environment variables. No email is sent anywhere here.

-- ---------------------------------------------------------------- 1. tables
create table if not exists public.assessment_traits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  domain text not null check (domain in ('affective', 'psychomotor')),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, domain, lower(name))
);
create index if not exists assessment_traits_school_idx
  on public.assessment_traits(school_id, domain, sort_order);

create table if not exists public.domain_assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  trait_id uuid not null references public.assessment_traits(id) on delete cascade,
  domain text not null check (domain in ('affective', 'psychomotor')),
  trait_name text not null,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, term_id, trait_id)
);
create index if not exists domain_assessments_student_idx
  on public.domain_assessments(student_id, term_id);
create index if not exists domain_assessments_class_idx
  on public.domain_assessments(class_id, term_id);

create table if not exists public.domain_assessment_comments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  domain text not null check (domain in ('affective', 'psychomotor')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, term_id, domain)
);
create index if not exists domain_assessment_comments_student_idx
  on public.domain_assessment_comments(student_id, term_id);

alter table public.assessment_traits enable row level security;
alter table public.domain_assessments enable row level security;
alter table public.domain_assessment_comments enable row level security;

-- ---------------------------------------------------------------- 2. RLS - school pattern (0002)
do $$
declare t text;
begin
  for t in select unnest(array[
    'assessment_traits', 'domain_assessments', 'domain_assessment_comments'
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

-- ---------------------------------------------------------------- 3. RLS - teacher write (0005/0006 pattern)
-- An Active teacher may rate pupils in a class they teach. The
-- trait list itself is admin-only (no teacher write policy on
-- assessment_traits).
create policy "teacher domain assessments insert" on public.domain_assessments
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and public.i_teach_class(class_id)
  );
create policy "teacher domain assessments update" on public.domain_assessments
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and public.i_teach_class(class_id)
  )
  with check (
    school_id = public.my_school_id()
    and public.i_teach_class(class_id)
  );
create policy "teacher domain assessments delete" on public.domain_assessments
  for delete to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and public.i_teach_class(class_id)
  );
create policy "teacher domain comments insert" on public.domain_assessment_comments
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and exists (
      select 1 from public.students s
      where s.id = domain_assessment_comments.student_id
        and public.i_teach_class(s.class_id)
    )
  );
create policy "teacher domain comments update" on public.domain_assessment_comments
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and exists (
      select 1 from public.students s
      where s.id = domain_assessment_comments.student_id
        and public.i_teach_class(s.class_id)
    )
  )
  with check (
    school_id = public.my_school_id()
    and exists (
      select 1 from public.students s
      where s.id = domain_assessment_comments.student_id
        and public.i_teach_class(s.class_id)
    )
  );
create policy "teacher domain comments delete" on public.domain_assessment_comments
  for delete to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and exists (
      select 1 from public.students s
      where s.id = domain_assessment_comments.student_id
        and public.i_teach_class(s.class_id)
    )
  );

-- ---------------------------------------------------------------- 4. default traits per school
-- Idempotent: only seeds a domain that has no active traits yet.
create or replace function public.ensure_default_assessment_traits(p_school_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_affective text[] := array[
    'Punctuality', 'Neatness', 'Honesty', 'Obedience',
    'Attentiveness', 'Cooperation', 'Leadership'
  ];
  v_psychomotor text[] := array[
    'Handwriting', 'Drawing', 'Craftwork', 'Sports and Games',
    'ICT and Computer Use', 'Practical Skills'
  ];
  v_name text;
  v_i integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'You are not signed in.');
  end if;
  if not exists (select 1 from public.schools where id = p_school_id) then
    return jsonb_build_object('ok', false, 'error', 'School not found.');
  end if;

  if not exists (
    select 1 from public.assessment_traits
    where school_id = p_school_id and domain = 'affective' and is_active
  ) then
    for v_i in 1 .. array_length(v_affective, 1) loop
      v_name := v_affective[v_i];
      insert into public.assessment_traits (school_id, domain, name, sort_order)
      values (p_school_id, 'affective', v_name, v_i)
      on conflict (school_id, domain, lower(name)) do nothing;
    end loop;
  end if;

  if not exists (
    select 1 from public.assessment_traits
    where school_id = p_school_id and domain = 'psychomotor' and is_active
  ) then
    for v_i in 1 .. array_length(v_psychomotor, 1) loop
      v_name := v_psychomotor[v_i];
      insert into public.assessment_traits (school_id, domain, name, sort_order)
      values (p_school_id, 'psychomotor', v_name, v_i)
      on conflict (school_id, domain, lower(name)) do nothing;
    end loop;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.ensure_default_assessment_traits(uuid) to authenticated;
