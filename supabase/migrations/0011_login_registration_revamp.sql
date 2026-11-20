-- Digital SchoolVerse - migration 0011: login / registration revamp
-- Run in the Supabase SQL editor AFTER 0010_school_branding_colours.sql.
-- This migration does NOT edit 0001-0010.
--
-- What it does:
--   1. Teachers pick their own classes at registration: a new
--      `teacher_class_picks` table (teacher + class + optional
--      subject). A pick counts as teaching that class (and that
--      subject, when one is picked) - `i_teach_class` and
--      `i_teach_subject` are updated to include picks, so a picked
--      class shows in the teacher workspace and unlocks registers,
--      scores and homework for it, exactly like an admin assignment.
--      Teacher registration still starts Pending and still needs
--      the school admin to approve it.
--   2. Students pre-verified by the admin's file: `register_self`
--      takes an optional `p_student_id`. When the student matches a
--      pre-uploaded record, the profile is created Active straight
--      away - no teacher/admin approval step, no admin notification.
--      A record that already has a login cannot be claimed twice.
--      The manual path (no student id) is unchanged: a new pupil
--      row is created and the account stays Pending for approval.
--   3. `register_self` also takes `p_class_picks` for teachers.
--   4. `school_registration_status` also returns `class_subjects`
--      (which subjects are offered in each class) so the teacher
--      register page can offer subject picks.
--   5. `set_teacher_class_picks(...)` - a teacher changes their own
--      picks, or the school admin changes any teacher's picks.
--   6. `bulk_staff_action(...)` - the school admin (or platform
--      owner) applies one action to a set of teachers: suspend,
--      reactivate, revoke, make senior staff, remove senior staff,
--      or grant an access upgrade (a permission from the existing
--      teacher permission set). Status changes run through this RPC
--      because the RLS policies only let the platform owner update
--      profiles directly.
--   7. The school admin can now read all profiles in their own
--      school (needed for the Teachers & Staff list to show each
--      teacher's login status). Before this, only Pending profiles
--      were visible to the admin.
--
-- No new environment variables. No email is sent anywhere here.

-- ---------------------------------------------------------------- 1. teacher class picks
create table if not exists public.teacher_class_picks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- One pick per teacher + class + subject. NULLS NOT DISTINCT so a
-- class-only pick (no subject) is also unique per teacher + class.
create unique index if not exists teacher_class_picks_unique_idx
  on public.teacher_class_picks (teacher_id, class_id, subject_id)
  nulls not distinct;
create index if not exists teacher_class_picks_teacher_idx
  on public.teacher_class_picks(teacher_id);
create index if not exists teacher_class_picks_class_idx
  on public.teacher_class_picks(class_id);

alter table public.teacher_class_picks enable row level security;

-- Read: the school admin / platform owner, or the teacher themself.
create policy "teacher picks read school or own" on public.teacher_class_picks
  for select to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  );
-- Write: the school admin / platform owner, or the teacher themself.
create policy "teacher picks write school or own" on public.teacher_class_picks
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  );
create policy "teacher picks update school or own" on public.teacher_class_picks
  for update to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  )
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  );
create policy "teacher picks delete school or own" on public.teacher_class_picks
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
    or (school_id = public.my_school_id() and teacher_id = public.my_teacher_id())
  );

-- ---------------------------------------------------------------- 2. admin reads all profiles in own school
create policy "profiles read school admin" on public.profiles
  for select to authenticated
  using (
    school_id = public.my_school_id()
    and public.my_role() = 'school_admin'
  );

-- ---------------------------------------------------------------- 3. picks count as teaching
-- A class-only pick teaches the class but no single subject; a
-- subject pick teaches that subject in that class.
create or replace function public.i_teach_class(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_subjects cs
    where cs.class_id = p_class_id and cs.teacher_id = public.my_teacher_id()
  ) or exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.class_teacher_id = public.my_teacher_id()
  ) or exists (
    select 1 from public.teacher_class_picks tp
    where tp.class_id = p_class_id and tp.teacher_id = public.my_teacher_id()
  );
$$;

create or replace function public.i_teach_subject(p_class_id uuid, p_subject_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_subjects cs
    where cs.class_id = p_class_id
      and cs.subject_id = p_subject_id
      and cs.teacher_id = public.my_teacher_id()
  ) or exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.class_teacher_id = public.my_teacher_id()
  ) or exists (
    select 1 from public.teacher_class_picks tp
    where tp.class_id = p_class_id
      and tp.subject_id = p_subject_id
      and tp.teacher_id = public.my_teacher_id()
  );
$$;

-- ---------------------------------------------------------------- 4. registration status also lists class subjects
create or replace function public.school_registration_status(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'school', jsonb_build_object(
      'id', sch.id, 'slug', sch.slug, 'name', sch.name,
      'motto', sch.motto, 'logo_url', sch.logo_url
    ),
    'phases', jsonb_build_object(
      'teacher', sch.reg_teacher_open,
      'student', sch.reg_student_open,
      'parent', sch.reg_parent_open
    ),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'stage', c.stage, 'arm', c.arm
      ) order by c.name)
      from public.classes c where c.school_id = sch.id
    ), '[]'::jsonb),
    'class_subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'class_id', cs.class_id,
        'subject_id', cs.subject_id,
        'subject_name', sub.name
      ) order by sub.name)
      from public.class_subjects cs
      join public.subjects sub on sub.id = cs.subject_id
      where sub.school_id = sch.id
    ), '[]'::jsonb)
  )
  from public.schools sch
  where sch.slug = p_slug;
$$;
grant execute on function public.school_registration_status(text) to anon, authenticated;

-- ---------------------------------------------------------------- 5. register_self: student id + teacher picks
-- New params (defaults keep old callers working):
--   p_student_id  - the pre-uploaded pupil this student is claiming.
--                   When given, the profile is created Active at once
--                   (pre-verified by the admin's file) and no approval
--                   notification is sent.
--   p_class_picks - [{class_id, subject_id?}] the teacher teaches.
create or replace function public.register_self(
  p_school_id uuid,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_class_id uuid,
  p_pupils jsonb,
  p_student_id uuid default null,
  p_class_picks jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_school record;
  v_teacher_id uuid;
  v_student_id uuid;
  v_parent_id uuid;
  v_admission text;
  v_seq integer;
  v_pupil jsonb;
  v_pupil_id uuid;
  v_pupil_class uuid;
  v_pupil_first text;
  v_pupil_last text;
  v_pupil_class_name text;
  v_matches integer;
  v_name text;
  v_status text := 'Pending';
  v_pre_verified boolean := false;
  v_pick jsonb;
  v_pick_class uuid;
  v_pick_subject uuid;
  v_matched record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'You are not signed in yet.');
  end if;
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'Your login has no email address.');
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'This login already has a profile. Sign in instead.');
  end if;
  select * into v_school from public.schools where id = p_school_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'School not found.');
  end if;
  if p_role not in ('teacher', 'student', 'parent') then
    return jsonb_build_object('ok', false, 'error', 'School admins do not self-register — the platform owner invites them from the Mother Board.');
  end if;
  if p_role = 'teacher' and not coalesce(v_school.reg_teacher_open, false) then
    return jsonb_build_object('ok', false, 'error', 'Teacher registration is not open yet. Ask the school admin when it opens.');
  end if;
  if p_role = 'student' and not coalesce(v_school.reg_student_open, false) then
    return jsonb_build_object('ok', false, 'error', 'Student registration is not open yet. Ask the school admin when it opens.');
  end if;
  if p_role = 'parent' and not coalesce(v_school.reg_parent_open, false) then
    return jsonb_build_object('ok', false, 'error', 'Parent registration is not open yet. Ask the school admin when it opens.');
  end if;
  if trim(coalesce(p_first_name, '')) = '' or trim(coalesce(p_last_name, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter your first and last name.');
  end if;

  if p_role = 'teacher' then
    insert into public.teachers (school_id, first_name, last_name, email, phone, role)
    values (p_school_id, trim(p_first_name), trim(p_last_name), v_email,
            nullif(trim(coalesce(p_phone, '')), ''), 'Teacher')
    returning id into v_teacher_id;
    -- The classes (and subjects) this teacher picked themself.
    if p_class_picks is not null then
      for v_pick in select * from jsonb_array_elements(p_class_picks) loop
        v_pick_class := (v_pick ->> 'class_id')::uuid;
        v_pick_subject := null;
        if (v_pick ->> 'subject_id') is not null then
          v_pick_subject := (v_pick ->> 'subject_id')::uuid;
        end if;
        if not exists (select 1 from public.classes where id = v_pick_class and school_id = p_school_id) then
          continue;
        end if;
        if v_pick_subject is not null and not exists (
          select 1 from public.subjects where id = v_pick_subject and school_id = p_school_id
        ) then
          continue;
        end if;
        insert into public.teacher_class_picks (school_id, teacher_id, class_id, subject_id)
        values (p_school_id, v_teacher_id, v_pick_class, v_pick_subject)
        on conflict do nothing;
      end loop;
    end if;
  elsif p_role = 'student' then
    if p_student_id is not null then
      -- Pre-verified: claim a pupil the admin already uploaded.
      select s.id, s.admission_no, s.class_id
        into v_matched
      from public.students s
      where s.id = p_student_id and s.school_id = p_school_id;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'That pupil could not be found in this school. Check the student ID, or register as a new pupil.');
      end if;
      if exists (select 1 from public.profiles where student_id = p_student_id) then
        return jsonb_build_object('ok', false, 'error', 'This pupil already has a login. If that is you, sign in instead - or ask the school for help.');
      end if;
      v_student_id := p_student_id;
      v_admission := v_matched.admission_no;
      v_pre_verified := true;
      v_status := 'Active';
    else
      -- Manual path (unchanged): a new pupil row, Pending approval.
      if p_class_id is null
        or not exists (select 1 from public.classes where id = p_class_id and school_id = p_school_id) then
        return jsonb_build_object('ok', false, 'error', 'Choose your class.');
      end if;
      select count(*) + 1 into v_seq from public.students where school_id = p_school_id;
      v_admission := 'DSV/' || extract(year from now())::text || '/' || lpad(v_seq::text, 4, '0');
      insert into public.students (school_id, class_id, admission_no, first_name, last_name)
      values (p_school_id, p_class_id, v_admission, trim(p_first_name), trim(p_last_name))
      returning id into v_student_id;
    end if;
  else
    insert into public.parents (school_id, first_name, last_name, phone, email)
    values (p_school_id, trim(p_first_name), trim(p_last_name),
            nullif(trim(coalesce(p_phone, '')), ''), v_email)
    returning id into v_parent_id;

    if p_pupils is not null then
      for v_pupil in select * from jsonb_array_elements(p_pupils) loop
        v_pupil_id := null;
        v_pupil_class := null;
        if v_pupil ? 'student_id' and (v_pupil ->> 'student_id') is not null then
          select s.id, s.class_id, s.first_name, s.last_name
            into v_pupil_id, v_pupil_class, v_pupil_first, v_pupil_last
          from public.students s
          where s.id = (v_pupil ->> 'student_id')::uuid and s.school_id = p_school_id;
          if v_pupil_id is null then
            return jsonb_build_object('ok', false, 'error', 'One of the pupils could not be found in this school. Check the admission number.');
          end if;
        elsif v_pupil ? 'first_name' and v_pupil ? 'last_name' then
          select count(*) into v_matches
          from public.students s
          where s.school_id = p_school_id
            and lower(s.first_name) = lower(trim(v_pupil ->> 'first_name'))
            and lower(s.last_name) = lower(trim(v_pupil ->> 'last_name'))
            and ((v_pupil ->> 'class_id') is null or s.class_id = (v_pupil ->> 'class_id')::uuid);
          if v_matches = 0 then
            return jsonb_build_object('ok', false, 'error',
              'No pupil matches "' || trim(v_pupil ->> 'first_name') || ' ' || trim(v_pupil ->> 'last_name') || '". Check the spelling and class, or use the admission number.');
          end if;
          if v_matches > 1 then
            return jsonb_build_object('ok', false, 'error',
              'More than one pupil is called "' || trim(v_pupil ->> 'first_name') || ' ' || trim(v_pupil ->> 'last_name') || '". Use the admission number to pick the right one.');
          end if;
          select s.id, s.class_id, s.first_name, s.last_name
            into v_pupil_id, v_pupil_class, v_pupil_first, v_pupil_last
          from public.students s
          where s.school_id = p_school_id
            and lower(s.first_name) = lower(trim(v_pupil ->> 'first_name'))
            and lower(s.last_name) = lower(trim(v_pupil ->> 'last_name'))
            and ((v_pupil ->> 'class_id') is null or s.class_id = (v_pupil ->> 'class_id')::uuid)
          limit 1;
        else
          continue;
        end if;

        insert into public.parent_children (parent_id, student_id, relationship, status)
        values (v_parent_id, v_pupil_id, nullif(trim(coalesce(v_pupil ->> 'relationship', '')), ''), 'Pending')
        on conflict (parent_id, student_id) do nothing;

        select c.name into v_pupil_class_name
        from public.classes c where c.id = v_pupil_class;
        v_name := trim(p_first_name) || ' ' || trim(p_last_name);
        insert into public.notifications (school_id, recipient_id, kind, title, body, link)
        select p_school_id, pr.id, 'pupil_link',
          'New pupil link to check',
          v_name || ' (parent) linked ' || v_pupil_first || ' ' || v_pupil_last ||
            coalesce(' · ' || v_pupil_class_name, '') ||
            ' as their child. Check it is the right pupil before the link is approved.',
          '/registration'
        from public.profiles pr
        where pr.school_id = p_school_id
          and pr.role = 'teacher'
          and pr.teacher_id is not null
          and (
            exists (select 1 from public.classes c
                    where c.id = v_pupil_class and c.class_teacher_id = pr.teacher_id)
            or exists (select 1 from public.class_subjects cs
                       where cs.class_id = v_pupil_class and cs.teacher_id = pr.teacher_id)
          );
      end loop;
    end if;
  end if;

  insert into public.profiles (id, email, display_name, role, school_id,
    teacher_id, student_id, parent_id, status, approved_at)
  values (v_uid, v_email, trim(p_first_name) || ' ' || trim(p_last_name),
    p_role, p_school_id, v_teacher_id, v_student_id, v_parent_id, v_status,
    case when v_pre_verified then now() else null end);

  -- Notify every school admin - except for a pre-verified student,
  -- who needs no approval and is straight in.
  if not v_pre_verified then
    insert into public.notifications (school_id, recipient_id, kind, title, body, link)
    select p_school_id, pr.id, 'registration',
      'New ' || p_role || ' registration',
      trim(p_first_name) || ' ' || trim(p_last_name) || ' (' || v_email || ') registered as ' ||
        replace(p_role, '_', ' ') || ' and is waiting for approval.',
      '/registration'
    from public.profiles pr
    where pr.school_id = p_school_id and pr.role = 'school_admin';
  end if;

  return jsonb_build_object('ok', true, 'role', p_role,
    'teacher_id', v_teacher_id, 'student_id', v_student_id,
    'parent_id', v_parent_id, 'admission_no', v_admission,
    'status', v_status, 'pre_verified', v_pre_verified);
end;
$$;
grant execute on function public.register_self(uuid, text, text, text, text, uuid, jsonb, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- 6. change a teacher's class picks
-- The teacher themself, or the school admin / platform owner.
-- p_picks: [{class_id, subject_id?}] - replaces all current picks.
create or replace function public.set_teacher_class_picks(
  p_teacher_id uuid, p_picks jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_teacher record;
  v_pick jsonb;
  v_pick_class uuid;
  v_pick_subject uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'You are not signed in.');
  end if;
  select * into v_teacher from public.teachers where id = p_teacher_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Teacher not found.');
  end if;
  if not (
    public.is_platform_owner()
    or (public.my_role() = 'school_admin' and public.my_school_id() = v_teacher.school_id)
    or (public.my_role() = 'teacher' and public.my_teacher_id() = p_teacher_id)
  ) then
    return jsonb_build_object('ok', false, 'error', 'You can only change your own classes.');
  end if;

  delete from public.teacher_class_picks where teacher_id = p_teacher_id;
  if p_picks is not null then
    for v_pick in select * from jsonb_array_elements(p_picks) loop
      v_pick_class := (v_pick ->> 'class_id')::uuid;
      v_pick_subject := null;
      if (v_pick ->> 'subject_id') is not null then
        v_pick_subject := (v_pick ->> 'subject_id')::uuid;
      end if;
      if not exists (select 1 from public.classes where id = v_pick_class and school_id = v_teacher.school_id) then
        continue;
      end if;
      if v_pick_subject is not null and not exists (
        select 1 from public.subjects where id = v_pick_subject and school_id = v_teacher.school_id
      ) then
        continue;
      end if;
      if not exists (
        select 1 from public.teacher_class_picks
        where teacher_id = p_teacher_id and class_id = v_pick_class
          and subject_id is not distinct from v_pick_subject
      ) then
        insert into public.teacher_class_picks (school_id, teacher_id, class_id, subject_id)
        values (v_teacher.school_id, p_teacher_id, v_pick_class, v_pick_subject);
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.set_teacher_class_picks(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- 7. bulk staff actions (admin / owner only)
-- p_action: suspend | reactivate | revoke | make_senior |
--   remove_senior | grant_access
-- p_permission (grant_access only): a permission from the existing
--   teacher permission set - currently 'approve_parents' (senior
--   staff: approve parent registrations). Unknown permissions are
--   refused so a typo cannot silently grant something else.
create or replace function public.bulk_staff_action(
  p_teacher_ids uuid[], p_action text, p_permission text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_caller_role text := public.my_role();
  v_caller_school uuid := public.my_school_id();
  v_school uuid;
  v_school_count integer;
  v_count integer := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'You are not signed in.');
  end if;
  if not (public.is_platform_owner() or v_caller_role = 'school_admin') then
    return jsonb_build_object('ok', false, 'error', 'Only the school admin can do this.');
  end if;
  if p_teacher_ids is null or cardinality(p_teacher_ids) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Pick at least one staff member first.');
  end if;
  select count(distinct school_id) into v_school_count
  from public.teachers where id = any(p_teacher_ids);
  if v_school_count <> 1 then
    return jsonb_build_object('ok', false, 'error', 'Pick staff from one school only.');
  end if;
  select school_id into v_school
  from public.teachers where id = any(p_teacher_ids) limit 1;
  if v_caller_role = 'school_admin' and v_caller_school <> v_school then
    return jsonb_build_object('ok', false, 'error', 'Those staff are not in your school.');
  end if;

  if p_action = 'suspend' then
    update public.profiles set status = 'Suspended'
    where teacher_id = any(p_teacher_ids) and status in ('Active', 'Pending');
    get diagnostics v_count = row_count;
  elsif p_action = 'reactivate' then
    update public.profiles set status = 'Active', status_reason = null
    where teacher_id = any(p_teacher_ids) and status = 'Suspended';
    get diagnostics v_count = row_count;
  elsif p_action = 'revoke' then
    update public.profiles
    set status = 'Rejected', status_reason = 'Access revoked by the school admin.'
    where teacher_id = any(p_teacher_ids) and status in ('Active', 'Pending', 'Suspended');
    get diagnostics v_count = row_count;
  elsif p_action = 'make_senior' then
    update public.teachers set can_approve_parents = true
    where id = any(p_teacher_ids);
    get diagnostics v_count = row_count;
  elsif p_action = 'remove_senior' then
    update public.teachers set can_approve_parents = false
    where id = any(p_teacher_ids);
    get diagnostics v_count = row_count;
  elsif p_action = 'grant_access' then
    if p_permission = 'approve_parents' then
      update public.teachers set can_approve_parents = true
      where id = any(p_teacher_ids);
      get diagnostics v_count = row_count;
    else
      return jsonb_build_object('ok', false, 'error', 'Unknown permission - pick one from the list.');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'Unknown action.');
  end if;

  return jsonb_build_object('ok', true, 'updated', v_count);
end;
$$;
grant execute on function public.bulk_staff_action(uuid[], text, text) to authenticated;
