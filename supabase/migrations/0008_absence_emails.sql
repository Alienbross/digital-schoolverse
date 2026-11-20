-- Digital SchoolVerse - migration 0008: absence emails to parents
-- Run in the Supabase SQL editor AFTER 0007_admission_fees_uploads.sql.
-- This migration does NOT edit 0001, 0002, 0003, 0004, 0005, 0006 or 0007.
--
-- What it does:
--   1. A new `absence_emails` table. When a teacher saves a register
--      and a pupil is marked Absent (or Late), the app queues one row
--      per linked parent of that pupil: pupil, parent, parent email,
--      date, kind (Absent / Late), reason, subject + body, and a
--      delivery status. One row per pupil + parent + date + kind, so
--      re-saving a register updates the notice in place instead of
--      duplicating it; re-marking a pupil Present / Excused clears
--      their still-queued notice for that day (a notice already Sent
--      is never overwritten or cleared).
--   2. No live email provider is connected yet, so nothing here sends
--      a real email. Every new row is labelled
--      'Queued - no live email provider yet' and is shown in the
--      portal instead: in the parent's workspace and in the
--      admin / teacher absence log. Parents with no email on record
--      get a row labelled 'Unreachable - no email on record' so they
--      are flagged in the log, never silently skipped. When a real
--      provider (Resend / SendGrid) is connected later, the
--      sendAbsenceEmail plug-in point in src/lib/absence-emails.ts
--      sends the queued email and flips the row to 'Sent'.
--   3. Only Approved pupil links are notified (migration 0006):
--      parent-proposed links still Pending are not emailed, and
--      Rejected links never are. The app enforces this when it queues
--      the rows; the table itself just records what was queued.
--   4. RLS: school-wide read (owner or own school, as in 0002);
--      insert / update / delete by the platform owner, the school
--      admin, or a teacher of that class (same shape as the teacher
--      attendance policies in 0005). Parents read their own school's
--      rows like every other school table in 0002, and the parent
--      workspace filters to their own linked children.
--
-- No passwords, tokens or keys are added anywhere, and no new env
-- vars are needed until a live email provider is chosen.

-- ---------------------------------------------------------------- table
create table if not exists public.absence_emails (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  term_id uuid references public.terms(id) on delete set null,
  record_date date not null,
  kind text not null check (kind in ('Absent', 'Late')),
  reason text,
  parent_name text not null,
  parent_email text,
  pupil_name text not null,
  subject text not null,
  body text not null,
  status text not null default 'Queued - no live email provider yet'
    check (status in (
      'Queued - no live email provider yet',
      'Unreachable - no email on record',
      'Sent'
    )),
  sent_at timestamptz,
  provider text, -- e.g. 'Resend' once a live provider is connected; null until then
  created_at timestamptz not null default now(),
  unique (student_id, parent_id, record_date, kind)
);
create index if not exists absence_emails_school_date_idx
  on public.absence_emails (school_id, record_date desc);
create index if not exists absence_emails_parent_idx
  on public.absence_emails (parent_id, record_date desc);
create index if not exists absence_emails_student_idx
  on public.absence_emails (student_id, record_date desc);

alter table public.absence_emails enable row level security;

-- ---------------------------------------------------------------- RLS
-- Read: platform owner or anyone in the same school (0002 pattern).
drop policy if exists "absence emails read" on public.absence_emails;
create policy "absence emails read" on public.absence_emails
  for select to authenticated
  using (public.is_platform_owner() or school_id = public.my_school_id());

-- Insert: owner, school admin, or a teacher of the class.
drop policy if exists "absence emails insert admin or owner" on public.absence_emails;
create policy "absence emails insert admin or owner" on public.absence_emails
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
drop policy if exists "absence emails insert teacher" on public.absence_emails;
create policy "absence emails insert teacher" on public.absence_emails
  for insert to authenticated
  with check (
    school_id = public.my_school_id()
    and public.my_role() = 'teacher'
    and public.i_teach_class(class_id)
  );

-- Update: owner, school admin, or a teacher of the class (re-saving a
-- register updates the queued notice in place; a live sender later
-- flips Queued rows to Sent the same way).
drop policy if exists "absence emails update admin or owner" on public.absence_emails;
create policy "absence emails update admin or owner" on public.absence_emails
  for update to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  )
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
drop policy if exists "absence emails update teacher" on public.absence_emails;
create policy "absence emails update teacher" on public.absence_emails
  for update to authenticated
  using (
    public.my_role() = 'teacher'
    and public.i_teach_class(class_id)
  )
  with check (
    school_id = public.my_school_id()
    and public.i_teach_class(class_id)
  );

-- Delete: owner, school admin, or a teacher of the class (used when a
-- re-saved register moves a pupil back to Present / Excused, so a
-- still-queued notice for that day is cleared, not left standing).
drop policy if exists "absence emails delete admin or owner" on public.absence_emails;
create policy "absence emails delete admin or owner" on public.absence_emails
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
drop policy if exists "absence emails delete teacher" on public.absence_emails;
create policy "absence emails delete teacher" on public.absence_emails
  for delete to authenticated
  using (
    public.my_role() = 'teacher'
    and public.i_teach_class(class_id)
  );
