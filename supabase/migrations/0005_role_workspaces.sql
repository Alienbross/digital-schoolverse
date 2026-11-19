-- Digital SchoolVerse — migration 0005: Teacher / Student / Parent workspaces
-- Run in the Supabase SQL editor AFTER 0004_school_slugs.sql.
-- This migration does NOT edit 0001, 0002, 0003 or 0004.
--
-- What it does:
--   1. Adds helper functions my_teacher_id() / my_student_id() /
--      my_parent_id() (like my_role() / my_school_id() from 0002).
--   2. Grants scoped writes so each role can do its own work, and
--      nothing else. Migration 0002 let only the platform owner and
--      the school_admin write school rows; without this migration a
--      teacher could not save a register, a student could not submit
--      a CBT attempt, and a parent could not pay online or raise a
--      complaint. RLS policies are permissive (OR): these new policies
--      sit alongside the 0002 ones, which stay exactly as they are.
--        - Teacher: attendance + scores for classes/subjects they
--          teach (or where they are class teacher), homework and CBT
--          practice tests for those classes, AI drafts for those
--          classes, complaints they raise, messages in their threads.
--        - Student: CBT attempts for their own record (practice
--          tests in their own class), study-help drafts, complaints
--          they raise, messages in their threads.
--        - Parent: online fee payments and complaints for their
--          linked children only, parent-summary drafts, messages in
--          their threads.
--      Nobody in these roles can write another school's rows, change
--      a grade through an AI draft (drafts never touch score_records),
--      resolve a complaint, or edit school setup — those stay
--      admin/owner only. Reads are unchanged (school-wide, 0002).
--   3. Reserves "teacher", "student" and "parent" as school slugs in
--      the database too (the app already reserves them for routing in
--      src/lib/slug.ts), so no school path can clash with the new
--      workspace routes /<slug>/teacher, /<slug>/student, /<slug>/parent.
--
-- No new tables or columns are needed: every workspace feature uses
-- tables from migration 0001.

-- ---------------------------------------------------------------- helpers
create or replace function public.my_teacher_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select teacher_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_student_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_parent_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select parent_id from public.profiles where id = auth.uid();
$$;

-- True when I teach this class: I am assigned a subject in it, or I
-- am its class teacher.
create or replace function public.i_teach_class(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_subjects cs
    where cs.class_id = p_class_id and cs.teacher_id = public.my_teacher_id()
  ) or exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.class_teacher_id = public.my_teacher_id()
  );
$$;

-- True when I teach this subject in this class.
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
  );
$$;

-- True when this pupil is one of my linked children.
create or replace function public.is_my_child(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.parent_children pc
    where pc.parent_id = public.my_parent_id()
      and pc.student_id = p_student_id
  );
$$;

-- True when I am part of this message thread (as its teacher, pupil,
-- parent, or the parent of its pupil).
create or replace function public.i_am_in_thread(p_thread_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id
      and (
        t.teacher_id = public.my_teacher_id()
        or t.student_id = public.my_student_id()
        or t.parent_id = public.my_parent_id()
        or public.is_my_child(t.student_id)
      )
  );
$$;

-- ---------------------------------------------------------------- teacher: attendance
create policy "teacher attendance insert" on public.attendance_records
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.i_teach_class(class_id)
  );
create policy "teacher attendance update" on public.attendance_records
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.i_teach_class(class_id)
  )
  with check (
    school_id = public.my_school_id()
    and public.i_teach_class(class_id)
  );

-- ---------------------------------------------------------------- teacher: scores
create policy "teacher scores insert" on public.score_records
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.i_teach_subject(class_id, subject_id)
  );
create policy "teacher scores update" on public.score_records
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.i_teach_subject(class_id, subject_id)
  )
  with check (
    school_id = public.my_school_id()
    and public.i_teach_subject(class_id, subject_id)
  );

-- ---------------------------------------------------------------- teacher: homework
create policy "teacher homework insert" on public.homework_assignments
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and teacher_id = public.my_teacher_id()
    and public.i_teach_class(class_id)
  );
create policy "teacher homework update" on public.homework_assignments
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and teacher_id = public.my_teacher_id()
  )
  with check (
    school_id = public.my_school_id()
    and teacher_id = public.my_teacher_id()
    and public.i_teach_class(class_id)
  );

-- ---------------------------------------------------------------- teacher: AI drafts (incl. approve)
create policy "teacher ai drafts insert" on public.ai_drafts
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and kind in ('lesson_notes', 'questions', 'report_comment', 'class_summary')
    and (class_id is null or public.i_teach_class(class_id))
  );
create policy "teacher ai drafts update" on public.ai_drafts
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and (class_id is null or public.i_teach_class(class_id))
  )
  with check (
    school_id = public.my_school_id()
    and kind in ('lesson_notes', 'questions', 'report_comment', 'class_summary')
    and (class_id is null or public.i_teach_class(class_id))
  );

-- ---------------------------------------------------------------- teacher: CBT practice tests + questions
create policy "teacher cbt tests insert" on public.cbt_tests
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.i_teach_class(class_id)
  );
create policy "teacher cbt tests update" on public.cbt_tests
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.i_teach_class(class_id)
  )
  with check (
    school_id = public.my_school_id()
    and public.i_teach_class(class_id)
  );
create policy "teacher cbt questions insert" on public.cbt_questions
  for insert to authenticated
  with check (
    public.my_role() = 'teacher'
    and exists (
      select 1 from public.cbt_tests t
      where t.id = cbt_questions.test_id
        and t.school_id = public.my_school_id()
        and public.i_teach_class(t.class_id)
    )
  );
create policy "teacher cbt questions update" on public.cbt_questions
  for update to authenticated
  using (
    public.my_role() = 'teacher'
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

-- ---------------------------------------------------------------- student: CBT attempts (own record, own class, published test)
create policy "student cbt attempts insert" on public.cbt_attempts
  for insert to authenticated
  with check (
    public.my_role() = 'student'
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

-- ---------------------------------------------------------------- student: study-help drafts (own record only)
create policy "student ai drafts insert" on public.ai_drafts
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'student'
    and kind = 'study_help'
    and student_id = public.my_student_id()
  );

-- ---------------------------------------------------------------- parent: online fee payments (linked children only)
create policy "parent fee online insert" on public.fee_online_payments
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'parent'
    and public.is_my_child(student_id)
  );

-- ---------------------------------------------------------------- parent: progress-summary drafts (linked children only)
create policy "parent ai drafts insert" on public.ai_drafts
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'parent'
    and kind = 'parent_summary'
    and public.is_my_child(student_id)
  );

-- ---------------------------------------------------------------- all three roles: complaints they raise
create policy "role complaints insert" on public.complaints
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
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

-- ---------------------------------------------------------------- all three roles: message threads + messages
create policy "role threads insert" on public.message_threads
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and (
      (public.my_role() = 'teacher' and teacher_id = public.my_teacher_id())
      or (public.my_role() = 'student' and student_id = public.my_student_id())
      or (public.my_role() = 'parent' and parent_id = public.my_parent_id())
    )
  );
create policy "role messages insert" on public.messages
  for insert to authenticated
  with check (
    public.i_am_in_thread(thread_id)
    and (
      (public.my_role() = 'teacher' and sender_role = 'Teacher')
      or (public.my_role() = 'student' and sender_role = 'Student')
      or (public.my_role() = 'parent' and sender_role = 'Parent')
    )
  );

-- ---------------------------------------------------------------- reserve the workspace route words as slugs
-- (0004's list did not include them; the app reserves them in
-- src/lib/slug.ts. Re-creating the check keeps the two in step.)
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
      'teacher', 'student', 'parent'
    )
  );
