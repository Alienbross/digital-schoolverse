-- Digital SchoolVerse - migration 0027: notification RPC + route-word slugs
--
--   1. `notify_recipients` - a SECURITY DEFINER RPC that lets any
--      same-school staff member (admin AND teacher) write in-portal
--      notifications. The notifications table (0006) only accepts
--      direct inserts from the admin / owner, so a teacher recording
--      a sickbay event or setting homework could save the record but
--      the parent alert was refused by RLS. The RPC checks the
--      caller is in the school and that every recipient is a profile
--      in that same school, then inserts. Returns the number of
--      rows written. Used by src/lib/news.ts, src/lib/sickbay.ts and
--      src/lib/homework-reminders.ts.
--   2. Reserves the new feature route words as school slugs
--      (votes, teacher-profiles, my-bio, student-bio, sickbay,
--      summaries, homework-reminders, games), keeping the check from
--      0021 (which added 'news') in step.
create or replace function public.notify_recipients(
  p_school_id uuid,
  p_recipient_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_link text
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
begin
  -- Caller must be in this school (or the platform owner).
  if not (
    public.is_platform_owner()
    or public.my_school_id() = p_school_id
  ) then
    raise exception 'not in this school';
  end if;
  if p_recipient_ids is null or array_length(p_recipient_ids, 1) is null then
    return 0;
  end if;
  -- Only profiles in this school can be notified.
  insert into public.notifications (school_id, recipient_id, kind, title, body, link)
  select p_school_id, r, p_kind, p_title, p_body, p_link
  from unnest(p_recipient_ids) as r
  where exists (
    select 1 from public.profiles p
    where p.id = r and p.school_id = p_school_id
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.notify_recipients(uuid, uuid[], text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- reserve the new feature route words as slugs
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
      'summaries', 'homework-reminders', 'games'
    )
  );
