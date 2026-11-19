-- Digital SchoolVerse — migration 0006: self-registration + approvals
-- Run in the Supabase SQL editor AFTER 0005_role_workspaces.sql.
-- This migration does NOT edit 0001, 0002, 0003, 0004 or 0005.
--
-- What it does:
--   1. Profiles gain a Pending / Rejected lifecycle: `status` may now
--      also be 'Pending' or 'Rejected', plus `status_reason`,
--      `approved_by` and `approved_at`. A user can no longer flip
--      their own status to Active (the 0002 self-update policy is
--      re-created with that guard); only the approval RPC below, or
--      the platform owner, changes status.
--   2. Schools gain registration-phase switches: `reg_teacher_open`,
--      `reg_student_open`, `reg_parent_open` (all Closed by default).
--      The school admin opens them in order — teachers, then
--      students, then parents — or all at once.
--   3. Teachers gain `can_approve_parents`: senior staff the admin
--      grants parent-approval rights to (set in Teachers & Staff).
--   4. `parent_children` gains `status` (Pending / Approved /
--      Rejected): a parent's proposed pupil link starts Pending so a
--      mixup can be corrected before approval.
--   5. A new `notifications` table (in-app only, no email): the app
--      notifies school admins when anyone registers, class teachers
--      when a parent links one of their pupils, and the user when
--      their registration is approved or rejected.
--   6. Public (anon) RPCs for the register pages:
--        - `school_registration_status(slug)` — school branding,
--          which phases are open, and the school's classes.
--        - `school_find_pupil_by_admission(...)` /
--          `school_find_pupils_by_name(...)` — pupil lookup for
--          parent pairing (returns name + class only).
--   7. SECURITY DEFINER RPCs that do the privileged work, so no
--      client can promote itself:
--        - `register_self(...)` — creates the teacher / student /
--          parent row, the Pending profile, proposed pupil links and
--          the notifications. Refuses when the phase is closed.
--        - `decide_registration(...)` — approve / reject a Pending
--          profile. Teachers: school admin only. Students: class
--          teacher(s) of the pupil's class OR school admin. Parents:
--          school admin OR a senior-staff teacher
--          (`can_approve_parents`). Approving a parent also approves
--          their proposed pupil links. A still-pending account cannot
--          decide anyone else's registration.
--        - `decide_pupil_link(...)` — approve / reject one proposed
--          pupil link (admin or the pupil's class teacher).
--        - `add_pupil_link(...)` — a parent adds another pupil under
--          them (from their workspace, before or after approval);
--          the link starts Pending and the admin + class teacher
--          are notified.
--   8. RLS: pending accounts can complete their own setup only —
--      a teacher / student / parent may update their own record
--      (name, phone, class, details) and a parent may propose pupil
--      links — but the migration-0005 role write policies are
--      re-created here with an extra `my_status() = 'Active'` check,
--      so a Pending account cannot take registers, enter scores, pay
--      fees, raise complaints, message or sit CBT until approved.
--      Approvers can read the Pending profiles they may decide:
--      the school admin reads all Pending profiles in the school,
--      a class teacher reads Pending students in classes they
--      teach, and senior staff read Pending parents.
--   9. 'register' and 'registration' join the reserved slugs
--      (the new /<slug>/register and /<slug>/registration pages).
--
-- No email is sent anywhere in this migration — notifications are
-- in-app only. The Mother Board invite flow for school admins is
-- unchanged: admins still do NOT self-register.

-- ---------------------------------------------------------------- 1. profile lifecycle
alter table public.profiles
  add column if not exists status_reason text;
alter table public.profiles
  add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.profiles
  add column if not exists approved_at timestamptz;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('Active', 'Pending', 'Rejected', 'Suspended'));

-- ---------------------------------------------------------------- 2. registration phases
alter table public.schools
  add column if not exists reg_teacher_open boolean not null default false;
alter table public.schools
  add column if not exists reg_student_open boolean not null default false;
alter table public.schools
  add column if not exists reg_parent_open boolean not null default false;

-- ---------------------------------------------------------------- 3. senior staff
alter table public.teachers
  add column if not exists can_approve_parents boolean not null default false;

-- ---------------------------------------------------------------- 4. proposed pupil links
alter table public.parent_children
  add column if not exists status text not null default 'Pending'
  check (status in ('Pending', 'Approved', 'Rejected'));

-- Existing links were made by the admin, so they are already approved.
update public.parent_children set status = 'Approved' where status = 'Pending';

-- ---------------------------------------------------------------- 5. notifications (in-app only)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, -- registration | pupil_link | approval | rejection
  title text not null,
  body text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, is_read, created_at desc);
create index if not exists notifications_school_idx
  on public.notifications(school_id, created_at desc);

alter table public.notifications enable row level security;

-- Read: your own notifications, or the school admin / owner.
create policy "notifications read own or school admin" on public.notifications
  for select to authenticated
  using (
    recipient_id = auth.uid()
    or public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
-- Insert: school admin / owner only (the RPCs below bypass RLS).
create policy "notifications insert admin or owner" on public.notifications
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
-- Update: only the recipient, to mark their own notifications read.
create policy "notifications update own" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------- helpers
create or replace function public.my_status()
returns text
language sql stable security definer set search_path = public as $$
  select status from public.profiles where id = auth.uid();
$$;

-- True when I am a teacher the admin has made senior staff for
-- parent approvals.
create or replace function public.i_can_approve_parents()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.teachers t on t.id = p.teacher_id
    where p.id = auth.uid() and t.can_approve_parents
  );
$$;

-- ---------------------------------------------------------------- 6. public register-page lookups
-- School branding + open phases + classes, for /<slug>/register.
-- Returns null when no school has that slug. Never returns emails,
-- phones, plan or status — same rule as school_by_slug (0004).
create or replace function public.school_registration_status(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'school', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name,
      'motto', s.motto, 'logo_url', s.logo_url
    ),
    'phases', jsonb_build_object(
      'teacher', s.reg_teacher_open,
      'student', s.reg_student_open,
      'parent', s.reg_parent_open
    ),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'stage', c.stage, 'arm', c.arm
      ) order by c.name)
      from public.classes c where c.school_id = s.id
    ), '[]'::jsonb)
  )
  from public.schools s
  where s.slug = p_slug;
$$;
grant execute on function public.school_registration_status(text) to anon, authenticated;

-- Pupil lookup by admission number (parent pairing). Returns name +
-- class only — the register page is public by design, and the
-- admission number is the shared key the school gives parents.
create or replace function public.school_find_pupil_by_admission(
  p_school_id uuid, p_admission_no text
)
returns table (
  id uuid, first_name text, last_name text,
  class_id uuid, class_name text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.first_name, s.last_name, s.class_id, c.name
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.school_id = p_school_id
    and upper(s.admission_no) = upper(trim(p_admission_no));
$$;
grant execute on function public.school_find_pupil_by_admission(uuid, text) to anon, authenticated;

-- Pupil lookup by name + class (parent pairing when the admission
-- number is not to hand).
create or replace function public.school_find_pupils_by_name(
  p_school_id uuid, p_first_name text, p_last_name text, p_class_id uuid
)
returns table (
  id uuid, first_name text, last_name text,
  class_id uuid, class_name text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.first_name, s.last_name, s.class_id, c.name
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.school_id = p_school_id
    and lower(s.first_name) = lower(trim(p_first_name))
    and lower(s.last_name) = lower(trim(p_last_name))
    and (p_class_id is null or s.class_id = p_class_id)
  order by s.first_name, s.last_name;
$$;
grant execute on function public.school_find_pupils_by_name(uuid, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------- 7a. register_self
-- Creates the teacher / student / parent row, a Pending profile for
-- the signed-in user, proposed pupil links (parents), and the
-- notifications for the school admin (+ class teachers for each
-- proposed pupil). Refuses when the role's phase is closed.
-- p_pupils: [{student_id}] or [{first_name, last_name, class_id, relationship}]
create or replace function public.register_self(
  p_school_id uuid,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_class_id uuid,
  p_pupils jsonb
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
  elsif p_role = 'student' then
    if p_class_id is null
      or not exists (select 1 from public.classes where id = p_class_id and school_id = p_school_id) then
      return jsonb_build_object('ok', false, 'error', 'Choose your class.');
    end if;
    -- Admission numbers are app-generated DSV/<year>/<seq> (same
    -- pattern as the admin register in the app).
    select count(*) + 1 into v_seq from public.students where school_id = p_school_id;
    v_admission := 'DSV/' || extract(year from now())::text || '/' || lpad(v_seq::text, 4, '0');
    insert into public.students (school_id, class_id, admission_no, first_name, last_name)
    values (p_school_id, p_class_id, v_admission, trim(p_first_name), trim(p_last_name))
    returning id into v_student_id;
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
        -- Notify the class teacher(s) of that pupil's class so a
        -- wrong child / wrong class can be corrected before approval.
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
    teacher_id, student_id, parent_id, status)
  values (v_uid, v_email, trim(p_first_name) || ' ' || trim(p_last_name),
    p_role, p_school_id, v_teacher_id, v_student_id, v_parent_id, 'Pending');

  -- Notify every school admin of the school.
  insert into public.notifications (school_id, recipient_id, kind, title, body, link)
  select p_school_id, pr.id, 'registration',
    'New ' || p_role || ' registration',
    trim(p_first_name) || ' ' || trim(p_last_name) || ' (' || v_email || ') registered as ' ||
      replace(p_role, '_', ' ') || ' and is waiting for approval.',
    '/registration'
  from public.profiles pr
  where pr.school_id = p_school_id and pr.role = 'school_admin';

  return jsonb_build_object('ok', true, 'role', p_role,
    'teacher_id', v_teacher_id, 'student_id', v_student_id,
    'parent_id', v_parent_id, 'admission_no', v_admission);
end;
$$;
grant execute on function public.register_self(uuid, text, text, text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- 7b. decide_registration
-- Approve / reject a Pending profile. Who may decide:
--   teacher -> school admin only
--   student -> the pupil's class teacher(s) OR school admin
--   parent  -> school admin OR senior staff (can_approve_parents)
-- The platform owner may decide any of them. Approving a parent
-- also approves their proposed pupil links.
create or replace function public.decide_registration(
  p_profile_id uuid, p_approve boolean, p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_target record;
  v_caller_role text := public.my_role();
  v_caller_school uuid := public.my_school_id();
  v_allowed boolean := false;
  v_pupil_class uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'You are not signed in.');
  end if;
  -- A still-pending account cannot approve anyone else.
  if not public.is_platform_owner() and public.my_status() <> 'Active' then
    return jsonb_build_object('ok', false, 'error', 'Your account is waiting for approval.');
  end if;
  select * into v_target from public.profiles where id = p_profile_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Account not found.');
  end if;
  if v_target.status <> 'Pending' then
    return jsonb_build_object('ok', false, 'error', 'This account is already ' || lower(v_target.status) || '.');
  end if;

  if public.is_platform_owner() then
    v_allowed := true;
  elsif v_caller_role = 'school_admin' and v_caller_school = v_target.school_id then
    v_allowed := true;
  elsif v_target.role = 'student' and v_caller_role = 'teacher' and v_caller_school = v_target.school_id then
    select class_id into v_pupil_class from public.students where id = v_target.student_id;
    if v_pupil_class is not null and public.i_teach_class(v_pupil_class) then
      v_allowed := true;
    end if;
  elsif v_target.role = 'parent' and v_caller_role = 'teacher'
    and v_caller_school = v_target.school_id
    and public.i_can_approve_parents() then
    v_allowed := true;
  end if;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', 'You cannot approve this account.');
  end if;

  if p_approve then
    update public.profiles
      set status = 'Active', approved_by = auth.uid(), approved_at = now(), status_reason = null
      where id = p_profile_id;
    if v_target.role = 'parent' then
      update public.parent_children set status = 'Approved'
      where parent_id = v_target.parent_id and status = 'Pending';
    end if;
    insert into public.notifications (school_id, recipient_id, kind, title, body, link)
    values (v_target.school_id, p_profile_id, 'approval',
      'Your account was approved',
      'Your ' || replace(v_target.role, '_', ' ') ||
        ' account was approved. You now have full access to your workspace.',
      '/');
  else
    update public.profiles
      set status = 'Rejected', status_reason = nullif(trim(coalesce(p_reason, '')), ''),
          approved_by = auth.uid(), approved_at = now()
      where id = p_profile_id;
    insert into public.notifications (school_id, recipient_id, kind, title, body, link)
    values (v_target.school_id, p_profile_id, 'rejection',
      'Your registration was not approved',
      'Your ' || replace(v_target.role, '_', ' ') || ' registration was not approved.' ||
        case when nullif(trim(coalesce(p_reason, '')), '') is not null
          then ' Reason: ' || trim(p_reason) else ' Contact the school admin if you think this is a mistake.' end,
      '/');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.decide_registration(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------- 7c. decide_pupil_link
-- Approve / reject one proposed parent–child link: the school admin
-- or the pupil's class teacher.
create or replace function public.decide_pupil_link(
  p_link_id uuid, p_approve boolean, p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_link record;
  v_pupil record;
  v_parent_profile uuid;
  v_caller_role text := public.my_role();
  v_caller_school uuid := public.my_school_id();
  v_allowed boolean := false;
  v_school_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'You are not signed in.');
  end if;
  -- A still-pending account cannot decide anyone else's link.
  if not public.is_platform_owner() and public.my_status() <> 'Active' then
    return jsonb_build_object('ok', false, 'error', 'Your account is waiting for approval.');
  end if;
  select pc.*, s.school_id, s.class_id, s.first_name, s.last_name
    into v_link
  from public.parent_children pc
  join public.students s on s.id = pc.student_id
  where pc.id = p_link_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Pupil link not found.');
  end if;
  if v_link.status <> 'Pending' then
    return jsonb_build_object('ok', false, 'error', 'This link is already ' || lower(v_link.status) || '.');
  end if;
  v_school_id := v_link.school_id;

  if public.is_platform_owner() then
    v_allowed := true;
  elsif v_caller_role = 'school_admin' and v_caller_school = v_school_id then
    v_allowed := true;
  elsif v_caller_role = 'teacher' and v_caller_school = v_school_id
    and v_link.class_id is not null and public.i_teach_class(v_link.class_id) then
    v_allowed := true;
  end if;
  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', 'You cannot decide this pupil link.');
  end if;

  update public.parent_children
    set status = case when p_approve then 'Approved' else 'Rejected' end
    where id = p_link_id;

  select id into v_parent_profile from public.profiles where parent_id = v_link.parent_id;
  if v_parent_profile is not null then
    insert into public.notifications (school_id, recipient_id, kind, title, body, link)
    values (v_school_id, v_parent_profile,
      case when p_approve then 'approval' else 'rejection' end,
      case when p_approve then 'Pupil link approved' else 'Pupil link not approved' end,
      case when p_approve
        then 'Your link to ' || v_link.first_name || ' ' || v_link.last_name || ' was approved.'
        else 'Your link to ' || v_link.first_name || ' ' || v_link.last_name ||
          ' was not approved.' ||
          case when nullif(trim(coalesce(p_reason, '')), '') is not null
            then ' Reason: ' || trim(p_reason) else ' Contact the school admin if you think this is a mistake.' end
      end,
      '/parent');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.decide_pupil_link(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------- 7d. add_pupil_link
-- A parent adds another pupil under them (from their workspace,
-- before or after approval). The link starts Pending and the school
-- admin + the pupil's class teacher are notified.
create or replace function public.add_pupil_link(
  p_parent_id uuid, p_student_id uuid, p_relationship text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pupil record;
  v_parent record;
  v_caller_parent uuid := public.my_parent_id();
  v_caller_role text := public.my_role();
  v_caller_school uuid := public.my_school_id();
  v_existing text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'You are not signed in.');
  end if;
  select * into v_parent from public.parents where id = p_parent_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parent record not found.');
  end if;
  if not (
    (v_caller_role = 'parent' and v_caller_parent = p_parent_id)
    or public.is_platform_owner()
    or (v_caller_role = 'school_admin' and v_caller_school = v_parent.school_id)
  ) then
    return jsonb_build_object('ok', false, 'error', 'You can only add pupils under your own account.');
  end if;
  select s.*, c.name as class_name into v_pupil
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.id = p_student_id and s.school_id = v_parent.school_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Pupil not found in this school.');
  end if;

  select status into v_existing from public.parent_children
  where parent_id = p_parent_id and student_id = p_student_id;
  if v_existing = 'Approved' then
    return jsonb_build_object('ok', false, 'error', v_pupil.first_name || ' ' || v_pupil.last_name || ' is already linked to you.');
  end if;
  if v_existing = 'Pending' then
    return jsonb_build_object('ok', false, 'error', v_pupil.first_name || ' ' || v_pupil.last_name || ' is already proposed and waiting for approval.');
  end if;

  insert into public.parent_children (parent_id, student_id, relationship, status)
  values (p_parent_id, p_student_id, nullif(trim(coalesce(p_relationship, '')), ''), 'Pending')
  on conflict (parent_id, student_id) do update set status = 'Pending';

  -- Notify the school admin.
  insert into public.notifications (school_id, recipient_id, kind, title, body, link)
  select v_parent.school_id, pr.id, 'pupil_link',
    'New pupil link to check',
    v_parent.first_name || ' ' || v_parent.last_name || ' (parent) linked ' ||
      v_pupil.first_name || ' ' || v_pupil.last_name ||
      coalesce(' · ' || v_pupil.class_name, '') ||
      ' as their child. Check it is the right pupil before the link is approved.',
    '/registration'
  from public.profiles pr
  where pr.school_id = v_parent.school_id and pr.role = 'school_admin';

  -- Notify the class teacher(s) of that pupil's class.
  insert into public.notifications (school_id, recipient_id, kind, title, body, link)
  select v_parent.school_id, pr.id, 'pupil_link',
    'New pupil link to check',
    v_parent.first_name || ' ' || v_parent.last_name || ' (parent) linked ' ||
      v_pupil.first_name || ' ' || v_pupil.last_name ||
      coalesce(' · ' || v_pupil.class_name, '') ||
      ' as their child. Check it is the right pupil before the link is approved.',
    '/registration'
  from public.profiles pr
  where pr.school_id = v_parent.school_id
    and pr.role = 'teacher'
    and pr.teacher_id is not null
    and v_pupil.class_id is not null
    and (
      exists (select 1 from public.classes c
              where c.id = v_pupil.class_id and c.class_teacher_id = pr.teacher_id)
      or exists (select 1 from public.class_subjects cs
                 where cs.class_id = v_pupil.class_id and cs.teacher_id = pr.teacher_id)
    );

  return jsonb_build_object('ok', true, 'student_id', p_student_id);
end;
$$;
grant execute on function public.add_pupil_link(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- 8a. approvers can read Pending profiles
-- (The 0002 policy only let a user read their own row or the owner
-- read everything; the admin could not list who is waiting.)
create policy "profiles read school approvers" on public.profiles
  for select to authenticated
  using (
    school_id = public.my_school_id()
    and status = 'Pending'
    and (
      public.my_role() = 'school_admin'
      or (public.my_role() = 'teacher' and public.i_can_approve_parents() and role = 'parent')
      or (public.my_role() = 'teacher' and role = 'student'
          and exists (
            select 1 from public.students s
            where s.id = profiles.student_id
              and s.class_id is not null
              and public.i_teach_class(s.class_id)
          ))
    )
  );

-- ---------------------------------------------------------------- 8b. nobody may flip their own status
-- (Re-creates the 0002 policy with a status guard: a Pending user
-- cannot set themselves Active. The decide_registration RPC above
-- bypasses RLS, so approvals still work.)
drop policy if exists "profiles update own or owner" on public.profiles;
create policy "profiles update own or owner" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_platform_owner())
  with check (
    public.is_platform_owner()
    or (
      role = public.my_role()
      and school_id = public.my_school_id()
      and status = public.my_status()
    )
  );

-- ---------------------------------------------------------------- 8c. pending accounts complete their own setup
-- Teacher: their own teacher record (name, phone).
create policy "teacher update own record" on public.teachers
  for update to authenticated
  using (public.my_role() = 'teacher' and id = public.my_teacher_id())
  with check (
    public.my_role() = 'teacher'
    and id = public.my_teacher_id()
    and school_id = public.my_school_id()
  );
-- Student: their own pupil record (class, gender, date of birth).
create policy "student update own record" on public.students
  for update to authenticated
  using (public.my_role() = 'student' and id = public.my_student_id())
  with check (
    public.my_role() = 'student'
    and id = public.my_student_id()
    and school_id = public.my_school_id()
    and (class_id is null or exists (
      select 1 from public.classes c
      where c.id = students.class_id and c.school_id = public.my_school_id()
    ))
  );
-- Parent: their own parent record (name, phone).
create policy "parent update own record" on public.parents
  for update to authenticated
  using (public.my_role() = 'parent' and id = public.my_parent_id())
  with check (
    public.my_role() = 'parent'
    and id = public.my_parent_id()
    and school_id = public.my_school_id()
  );
-- Parent: propose pupil links under themselves (always Pending).
create policy "parent insert own links" on public.parent_children
  for insert to authenticated
  with check (
    public.my_role() = 'parent'
    and parent_id = public.my_parent_id()
    and status = 'Pending'
    and exists (
      select 1 from public.students s
      where s.id = parent_children.student_id
        and s.school_id = public.my_school_id()
    )
  );
-- Parent: withdraw a proposed link that is still Pending (wrong
-- child / wrong class, spotted before approval).
create policy "parent delete own pending links" on public.parent_children
  for delete to authenticated
  using (
    public.my_role() = 'parent'
    and parent_id = public.my_parent_id()
    and status = 'Pending'
  );

-- ---------------------------------------------------------------- 8d. pending accounts cannot do the rest
-- The migration-0005 role write policies are permissive (OR), so an
-- extra policy cannot restrict them — they are re-created here with
-- the same shape plus `my_status() = 'Active'`. Until a teacher /
-- student / parent is approved, their writes are refused even if
-- they call the API directly; the app also locks the UI (banner +
-- locked tabs in the workspaces).

-- teacher: attendance
drop policy if exists "teacher attendance insert" on public.attendance_records;
create policy "teacher attendance insert" on public.attendance_records
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and public.i_teach_class(class_id)
  );
drop policy if exists "teacher attendance update" on public.attendance_records;
create policy "teacher attendance update" on public.attendance_records
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

-- teacher: scores
drop policy if exists "teacher scores insert" on public.score_records;
create policy "teacher scores insert" on public.score_records
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and public.i_teach_subject(class_id, subject_id)
  );
drop policy if exists "teacher scores update" on public.score_records;
create policy "teacher scores update" on public.score_records
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and public.i_teach_subject(class_id, subject_id)
  )
  with check (
    school_id = public.my_school_id()
    and public.i_teach_subject(class_id, subject_id)
  );

-- teacher: homework
drop policy if exists "teacher homework insert" on public.homework_assignments;
create policy "teacher homework insert" on public.homework_assignments
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and teacher_id = public.my_teacher_id()
    and public.i_teach_class(class_id)
  );
drop policy if exists "teacher homework update" on public.homework_assignments;
create policy "teacher homework update" on public.homework_assignments
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and teacher_id = public.my_teacher_id()
  )
  with check (
    school_id = public.my_school_id()
    and teacher_id = public.my_teacher_id()
    and public.i_teach_class(class_id)
  );

-- teacher: AI drafts (incl. approve)
drop policy if exists "teacher ai drafts insert" on public.ai_drafts;
create policy "teacher ai drafts insert" on public.ai_drafts
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and kind in ('lesson_notes', 'questions', 'report_comment', 'class_summary')
    and (class_id is null or public.i_teach_class(class_id))
  );
drop policy if exists "teacher ai drafts update" on public.ai_drafts;
create policy "teacher ai drafts update" on public.ai_drafts
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and (class_id is null or public.i_teach_class(class_id))
  )
  with check (
    school_id = public.my_school_id()
    and kind in ('lesson_notes', 'questions', 'report_comment', 'class_summary')
    and (class_id is null or public.i_teach_class(class_id))
  );

-- teacher: CBT practice tests + questions
drop policy if exists "teacher cbt tests insert" on public.cbt_tests;
create policy "teacher cbt tests insert" on public.cbt_tests
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and public.i_teach_class(class_id)
  );
drop policy if exists "teacher cbt tests update" on public.cbt_tests;
create policy "teacher cbt tests update" on public.cbt_tests
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
drop policy if exists "teacher cbt questions insert" on public.cbt_questions;
create policy "teacher cbt questions insert" on public.cbt_questions
  for insert to authenticated
  with check (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and exists (
      select 1 from public.cbt_tests t
      where t.id = cbt_questions.test_id
        and t.school_id = public.my_school_id()
        and public.i_teach_class(t.class_id)
    )
  );
drop policy if exists "teacher cbt questions update" on public.cbt_questions;
create policy "teacher cbt questions update" on public.cbt_questions
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.my_status() = 'Active'
    and exists (
      select 1 from public.cbt_tests t
      where t.id = cbt_questions.test_id
        and public.i_teach_class(t.class_id)
    )
  )
  with check (
    public.my_role() = 'teacher'
    and exists (
      select 1 from public.cbt_tests t
      where t.id = cbt_questions.test_id
        and public.i_teach_class(t.class_id)
    )
  );

-- student: CBT attempts (own record, own class, published test)
drop policy if exists "student cbt attempts insert" on public.cbt_attempts;
create policy "student cbt attempts insert" on public.cbt_attempts
  for insert to authenticated
  with check (
    public.my_role() = 'student'
    and public.my_status() = 'Active'
    and student_id = public.my_student_id()
    and exists (
      select 1 from public.cbt_tests t
      join public.students s on s.id = public.my_student_id()
      where t.id = cbt_attempts.test_id
        and t.school_id = public.my_school_id()
        and t.class_id = s.class_id
        and t.status = 'Published'
    )
  );

-- student: study-help drafts (own record only)
drop policy if exists "student ai drafts insert" on public.ai_drafts;
create policy "student ai drafts insert" on public.ai_drafts
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'student'
    and public.my_status() = 'Active'
    and kind = 'study_help'
    and student_id = public.my_student_id()
  );

-- parent: online fee payments (linked children only)
drop policy if exists "parent fee online insert" on public.fee_online_payments;
create policy "parent fee online insert" on public.fee_online_payments
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'parent'
    and public.my_status() = 'Active'
    and public.is_my_child(student_id)
  );

-- parent: progress-summary drafts (linked children only)
drop policy if exists "parent ai drafts insert" on public.ai_drafts;
create policy "parent ai drafts insert" on public.ai_drafts
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'parent'
    and public.my_status() = 'Active'
    and kind = 'parent_summary'
    and public.is_my_child(student_id)
  );

-- all three roles: complaints they raise
drop policy if exists "role complaints insert" on public.complaints;
create policy "role complaints insert" on public.complaints
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_status() = 'Active'
    and (
      (public.my_role() = 'teacher' and raised_by = 'Teacher'
        and (student_id is null or exists (
          select 1 from public.students s
          where s.id = complaints.student_id and s.school_id = public.my_school_id()
        )))
      or (public.my_role() = 'student' and raised_by = 'Student'
        and (student_id is null or student_id = public.my_student_id()))
      or (public.my_role() = 'parent' and raised_by = 'Parent'
        and (student_id is null or public.is_my_child(student_id)))
    )
  );

-- all three roles: message threads + messages
drop policy if exists "role threads insert" on public.message_threads;
create policy "role threads insert" on public.message_threads
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_status() = 'Active'
    and (
      (public.my_role() = 'teacher' and teacher_id = public.my_teacher_id())
      or (public.my_role() = 'student' and student_id = public.my_student_id())
      or (public.my_role() = 'parent' and parent_id = public.my_parent_id())
    )
  );
drop policy if exists "role messages insert" on public.messages;
create policy "role messages insert" on public.messages
  for insert to authenticated
  with check (
    public.i_am_in_thread(thread_id)
    and public.my_status() = 'Active'
    and (
      (public.my_role() = 'teacher' and sender_role = 'Teacher')
      or (public.my_role() = 'student' and sender_role = 'Student')
      or (public.my_role() = 'parent' and sender_role = 'Parent')
    )
  );

-- ---------------------------------------------------------------- 9. reserve the register route words as slugs
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
      'teacher', 'student', 'parent', 'register', 'registration'
    )
  );
