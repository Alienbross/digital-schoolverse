-- Digital SchoolVerse - migration 0031: per-class registration links
-- Run in the Supabase SQL editor AFTER 0030_owner_otp_login.sql.
-- This migration does NOT edit any earlier migration.
--
-- What it does:
--   1. Pupils gain `guardian_contact` on the students table: the
--      phone or email of the guardian a new pupil gives when they
--      register from a class link. The file-upload flow is untouched
--      (it never writes this column).
--   2. A public (anon) RPC `school_class_for_link(slug, class_id)`:
--      returns the school branding, that ONE class, and whether
--      student registration is open. It never lists other classes,
--      so a class link cannot leak the rest of the school.
--   3. `register_self` gains a 12-arg overload with three new
--      optional params (defaults keep old callers working):
--        - `p_date_of_birth`  - the new pupil's date of birth
--        - `p_gender`         - Male or Female
--        - `p_guardian_contact` - guardian phone or email
--      The overload validates the new fields, then calls the 9-arg
--      `register_self` from migration 0011, so the approval rules
--      are unchanged: a new pupil is Pending until their class
--      teacher or the school admin approves them (migration 0006),
--      and a pre-verified claim stays Active at once. The new
--      details are stored on the pupil row only on the manual
--      (new pupil) path; a pre-verified claim keeps the file's own
--      record untouched.
--   4. No new table: the class id in the link is itself the token
--      (a random uuid), and the link page only ever shows one class.

-- ---------------------------------------------------------------- 1. guardian contact on pupils
alter table public.students
  add column if not exists guardian_contact text;

-- ---------------------------------------------------------------- 2. public class-link lookup
-- One class only: school branding + that class + student phase.
-- Returns null (no row) for a wrong slug, a wrong class id, or a
-- class from another school.
create or replace function public.school_class_for_link(p_slug text, p_class_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'school', jsonb_build_object(
      'id', sch.id, 'slug', sch.slug, 'name', sch.name,
      'motto', sch.motto, 'logo_url', sch.logo_url
    ),
    'class', jsonb_build_object(
      'id', c.id, 'name', c.name, 'stage', c.stage, 'arm', c.arm
    ),
    'student_open', sch.reg_student_open
  )
  from public.schools sch
  join public.classes c on c.id = p_class_id and c.school_id = sch.id
  where sch.slug = p_slug;
$$;
grant execute on function public.school_class_for_link(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------- 3. register_self: class-link details
-- New params have defaults, so the existing 9-arg callers keep
-- working. The 9-arg call below resolves to the migration 0011
-- function (9 args, not 12), so this cannot recurse into itself.
create or replace function public.register_self(
  p_school_id uuid,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_class_id uuid,
  p_pupils jsonb,
  p_student_id uuid default null,
  p_class_picks jsonb default '[]'::jsonb,
  p_date_of_birth date default null,
  p_gender text default null,
  p_guardian_contact text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_res jsonb;
  v_student_id uuid;
begin
  -- Validate the new fields first, so a bad value fails before any
  -- row is made.
  if p_gender is not null and p_gender not in ('Male', 'Female') then
    return jsonb_build_object('ok', false, 'error', 'Pick Male or Female for gender.');
  end if;
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    return jsonb_build_object('ok', false, 'error', 'Date of birth cannot be in the future.');
  end if;

  -- The migration 0011 function does the real work: pupil row,
  -- Pending profile, approval notifications. Approval rules are
  -- unchanged by this migration.
  v_res := public.register_self(
    p_school_id, p_role, p_first_name, p_last_name, p_phone,
    p_class_id, p_pupils, p_student_id, p_class_picks
  );
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    return v_res;
  end if;

  v_student_id := (v_res ->> 'student_id')::uuid;
  -- Manual (new pupil) path only: store the class-link details on
  -- the pupil row just made. A pre-verified claim (p_student_id
  -- given) keeps the file's own record untouched.
  if v_student_id is not null and p_role = 'student' and p_student_id is null then
    update public.students
    set gender = p_gender,
        date_of_birth = p_date_of_birth,
        guardian_contact = nullif(trim(coalesce(p_guardian_contact, '')), '')
    where id = v_student_id;
  end if;

  return v_res;
end;
$$;
grant execute on function public.register_self(uuid, text, text, text, text, uuid, jsonb, uuid, jsonb, date, text, text) to authenticated;
