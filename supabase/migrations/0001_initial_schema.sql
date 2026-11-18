-- Digital SchoolVerse — Supabase schema (pilot)
-- Run in the Supabase SQL editor (or `supabase db push` with the CLI).
-- Carries over the data model from the Muse main portal artifact
-- (digital-schoolverse-portal). One row set per school: every table
-- carries school_id so schools stay separate. Branch is optional and
-- defaults to the school's Main branch (branches.is_main).
-- RLS is enabled with a permissive pilot policy (anon can read/write).
-- BEFORE charging schools, replace it with auth-based policies that
-- check the caller's school_id (see README.md).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- schools
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  motto text,
  email text,
  phone text,
  address text,
  logo_url text,
  primary_color text default '#1D4ED8',
  created_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  location text,
  phone text,
  email text,
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists branches_school_idx on branches(school_id);

-- ---------------------------------------------------------------- terms
create table if not exists terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  session text not null,               -- e.g. 2026/2027
  name text not null,                  -- e.g. First Term
  start_date date,
  end_date date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, session, name)
);
create index if not exists terms_school_idx on terms(school_id);

-- ---------------------------------------------------------------- classes
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  name text not null,                  -- e.g. Primary 3B, JSS 1A
  stage text not null default 'Primary', -- Primary | Secondary
  arm text,
  capacity int,
  class_teacher_id uuid,               -- set after teachers exist
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists classes_school_idx on classes(school_id);

-- ---------------------------------------------------------------- subjects
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists class_subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid,
  created_at timestamptz not null default now(),
  unique (class_id, subject_id)
);
create index if not exists class_subjects_class_idx on class_subjects(class_id);

-- ---------------------------------------------------------------- people
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  role text not null default 'Teacher', -- Teacher | Staff
  created_at timestamptz not null default now()
);
create index if not exists teachers_school_idx on teachers(school_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'classes_class_teacher_fk') then
    alter table classes
      add constraint classes_class_teacher_fk
      foreign key (class_teacher_id) references teachers(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'class_subjects_teacher_fk') then
    alter table class_subjects
      add constraint class_subjects_teacher_fk
      foreign key (teacher_id) references teachers(id) on delete set null;
  end if;
end $$;

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  class_id uuid references classes(id) on delete set null,
  admission_no text not null,          -- app-generated DSV/2026/0001…
  first_name text not null,
  last_name text not null,
  gender text,
  date_of_birth date,
  created_at timestamptz not null default now(),
  unique (school_id, admission_no)
);
create index if not exists students_school_idx on students(school_id);
create index if not exists students_class_idx on students(class_id);

create table if not exists parents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists parents_school_idx on parents(school_id);

create table if not exists parent_children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  relationship text,                   -- Father | Mother | Guardian
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);
create index if not exists parent_children_student_idx on parent_children(student_id);

-- ------------------------------------------------------- attendance
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid references terms(id) on delete set null,
  record_date date not null,
  status text not null default 'Present', -- Present | Late | Absent | Excused
  reason text,
  created_at timestamptz not null default now(),
  unique (student_id, record_date)
);
create index if not exists attendance_class_date_idx on attendance_records(class_id, record_date);

-- ------------------------------------------------------- scores
-- Test /20, Assignment /10, Exam /70 — live total, Nigerian grades
-- (A 70+, B 60–69, C 50–59, D 45–49, E 40–44, F below 40) computed in app.
create table if not exists score_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid references terms(id) on delete set null,
  test_score int check (test_score is null or (test_score between 0 and 20)),
  assignment_score int check (assignment_score is null or (assignment_score between 0 and 10)),
  exam_score int check (exam_score is null or (exam_score between 0 and 70)),
  remark text,
  created_at timestamptz not null default now(),
  unique (student_id, subject_id, term_id)
);
create index if not exists scores_student_term_idx on score_records(student_id, term_id);

-- ------------------------------------------------------- fees
create table if not exists fee_bills (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid references terms(id) on delete set null,
  description text not null default 'Term fees',
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (student_id, term_id, description)
);

create table if not exists fee_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid references terms(id) on delete set null,
  amount numeric(12,2) not null,
  method text not null default 'Cash', -- Cash | Bank transfer | Card | POS | Cheque | Online
  paid_by text,
  paid_date date not null default current_date,
  reference text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists fee_payments_student_idx on fee_payments(student_id);

create table if not exists fee_online_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid references terms(id) on delete set null,
  amount numeric(12,2) not null,
  channel text not null,               -- Card | Bank transfer
  reference text not null unique,      -- PAY-2026-NNNN
  paystack_reference text,             -- filled in when live Paystack is connected
  status text not null default 'Paid', -- Paid | Failed | Refunded
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- complaints
create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  class_id uuid references classes(id) on delete set null,
  term_id uuid references terms(id) on delete set null,
  reference text not null,             -- CMP-2026-NNNN
  raised_by text not null,             -- Parent | Student | Teacher | School | Other
  reporter_name text,
  reporter_contact text,
  category text not null,
  priority text not null default 'Medium', -- Low | Medium | High | Urgent
  subject text,
  details text,
  status text not null default 'Open', -- Open | In progress | Resolved
  assignee_id uuid references teachers(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  source text not null default 'Staff log', -- Staff log | Online form
  guided_when text,
  guided_where text,
  guided_who text,
  desired_outcome text,
  evidence_note text,
  created_at timestamptz not null default now(),
  unique (school_id, reference)
);
create index if not exists complaints_school_idx on complaints(school_id, status);

-- ------------------------------------------------------- homework & timetable
create table if not exists homework_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  teacher_id uuid references teachers(id) on delete set null,
  term_id uuid references terms(id) on delete set null,
  title text not null,
  instructions text,
  due_date date,
  status text not null default 'Active', -- Active | Archived
  created_at timestamptz not null default now()
);
create index if not exists homework_class_idx on homework_assignments(class_id, due_date);

create table if not exists timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5), -- Mon=1 … Fri=5
  period int not null,
  subject_id uuid references subjects(id) on delete set null,
  teacher_id uuid references teachers(id) on delete set null,
  start_time time,
  end_time time,
  room text,
  created_at timestamptz not null default now(),
  unique (class_id, day_of_week, period)
);

-- ------------------------------------------------------- messages & announcements
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  audience text not null default 'Whole school', -- Whole school | Parents | Pupils | Staff | One class
  title text not null,
  body text not null,
  priority text not null default 'Normal', -- Normal | Important
  status text not null default 'Draft',    -- Draft | Published
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  parent_id uuid references parents(id) on delete set null,
  teacher_id uuid references teachers(id) on delete set null,
  subject text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  sender_role text not null,            -- School | Parent | Teacher
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on messages(thread_id);

-- ------------------------------------------------------- admissions
create table if not exists admission_applications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  reference text not null,             -- ADM-2026-NNNN
  child_first_name text not null,
  child_last_name text not null,
  class_id uuid references classes(id) on delete set null,
  entry_term_id uuid references terms(id) on delete set null,
  parent_name text,
  parent_phone text,
  parent_email text,
  previous_school text,
  notes text,
  source text not null default 'Online form', -- Online form | Walk-in | Phone | Referral
  status text not null default 'Submitted', -- Submitted | Under review | Assessment | Offered | Rejected | Waitlisted | Enrolled
  assessment_date date,
  assessment_note text,
  decision_note text,
  student_id uuid references students(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, reference)
);
create index if not exists admissions_school_idx on admission_applications(school_id, status);

-- ------------------------------------------------------- AI drafts (Advanced)
create table if not exists ai_drafts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  kind text not null,                  -- lesson_notes | questions | report_comment | class_summary
  title text not null,
  content text not null,
  status text not null default 'Draft', -- Draft | Approved
  class_id uuid references classes(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  student_id uuid references students(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- CBT (Advanced)
create table if not exists cbt_tests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  term_id uuid references terms(id) on delete set null,
  title text not null,
  time_limit_minutes int,
  due_date date,
  mode text not null default 'Graded', -- Graded | Practice
  status text not null default 'Draft', -- Draft | Published
  created_at timestamptz not null default now()
);

create table if not exists cbt_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references cbt_tests(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb, -- 4 options
  correct_index int not null default 0,
  marks int not null default 1
);

create table if not exists cbt_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references cbt_tests(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score numeric(6,2),
  total numeric(6,2),
  percentage numeric(5,2),
  grade text,
  counted_as text,                     -- Test | Assignment | Exam (null until teacher counts it)
  counted_value numeric(6,2),
  submitted_at timestamptz not null default now()
);
create index if not exists cbt_attempts_test_idx on cbt_attempts(test_id, student_id);

-- ------------------------------------------------------- parent alerts (Advanced)
create table if not exists parent_alerts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  category text not null,              -- Absence | Fee reminder | Homework/Test reminder | Announcement | Urgent notice
  audience text not null,              -- Whole school | One class | One pupil
  class_id uuid references classes(id) on delete set null,
  student_id uuid references students(id) on delete set null,
  channel text not null,               -- SMS | WhatsApp | SMS & WhatsApp
  message text not null,
  sent_by text,
  recipient_count int not null default 0,
  recipients jsonb not null default '[]'::jsonb, -- snapshot of who it reached
  status text not null default 'Test sent', -- Test sent | Sent
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- weekly summaries (Advanced)
create table if not exists weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  week_start date not null,
  summary_text text not null,
  school_note text,
  status text not null default 'Draft', -- Draft | Shared
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, week_start)
);

-- ------------------------------------------------------- bus / clinic / discipline (Advanced)
create table if not exists bus_routes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  name text not null,
  area text,
  pickup_points text,
  dropoff_points text,
  driver text,
  vehicle text,
  fee_note text,
  created_at timestamptz not null default now()
);

create table if not exists bus_assignments (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references bus_routes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  pickup_point text,
  dropoff_point text,
  created_at timestamptz not null default now(),
  unique (student_id)
);

create table if not exists bus_attendance (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references bus_routes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  record_date date not null,
  status text not null default 'Boarded', -- Boarded | Not boarded
  note text,
  created_at timestamptz not null default now(),
  unique (student_id, record_date)
);

create table if not exists clinic_visits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  visit_date date not null default current_date,
  complaint text not null,
  treatment text,
  outcome text not null default 'Returned to class', -- Returned to class | Sent home | Referred to hospital
  attended_by text,
  created_at timestamptz not null default now()
);
create index if not exists clinic_student_idx on clinic_visits(student_id);

create table if not exists discipline_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  incident_date date not null default current_date,
  category text not null,
  description text,
  action_taken text,
  staff_involved text,
  parent_informed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists discipline_student_idx on discipline_records(student_id);

-- ------------------------------------------------------- report card templates (Advanced)
create table if not exists report_card_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  printed_name text,
  motto text,
  show_subject_scores boolean not null default true,
  show_average boolean not null default true,
  show_attendance boolean not null default true,
  show_remarks boolean not null default true,
  show_behaviour boolean not null default false,
  show_fee_note boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, branch_id)
);

-- ------------------------------------------------------- RLS (pilot)
-- Every table above gets RLS with a permissive pilot policy so the
-- free-pilot app works with the anon key and no auth setup yet.
-- Replace these policies with auth-based ones (checking the caller's
-- school_id from their JWT) before charging schools.
do $$
declare t text;
begin
  for t in select tablename from pg_tables
    where schemaname = 'public'
      and tablename not like 'pg_%'
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "pilot open access" on %I', t);
    execute format(
      'create policy "pilot open access" on %I for all to anon using (true) with check (true)',
      t
    );
  end loop;
end $$;
