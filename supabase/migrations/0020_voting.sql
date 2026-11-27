-- Digital SchoolVerse - migration 0020: voting system
-- Run in the Supabase SQL editor AFTER 0019 (or the latest migration).
-- This migration does NOT edit 0001-0019.
--
-- What it does:
--   1. `votes` - one poll per row. The admin picks who may vote:
--      everybody, parents of one class, students of one class, or
--      teachers of the Primary or Secondary stage. A vote can be
--      anonymous (who voted for what is never shown) and has an
--      open / close window. Results are only shown once closed.
--   2. `vote_options` - the choices on a vote. Each option has a
--      typed name and may have a picture (e.g. picking between two
--      gift items, a bag picture + name).
--   3. `vote_ballots` - one ballot per voter per vote. The unique
--      constraint on (vote_id, voter_id) enforces one vote only.
--      Ballots are never updated or deleted.
--   4. RLS follows the 0002 school pattern (read: owner or own
--      school; write: owner or own school's school_admin) with the
--      0005 role pattern for ballots: any authenticated user of the
--      same school may insert one ballot of their own. Which votes
--      a person may actually see and vote in is decided in the app
--      (src/lib/voting.ts) - RLS only keeps schools apart.
--   5. Option pictures are NOT a new bucket. They go in the existing
--      public `school-logos` bucket (migration 0003) under
--      `<school_id>/votes/<file>` - the first path folder is the
--      school id, so the 0003 upload policy (owner or that school's
--      own school_admin) already covers them, and public read already
--      covers showing them to voters.
--
-- No new environment variables. No email is sent anywhere here.

-- ---------------------------------------------------------------- 1. tables
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  question text,
  anonymous boolean not null default false,
  audience_type text not null check (audience_type in (
    'everybody', 'parents_of_class', 'students_of_class',
    'teachers_primary', 'teachers_secondary'
  )),
  class_id uuid references public.classes(id) on delete set null,
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists votes_school_idx
  on public.votes(school_id, created_at desc);
create index if not exists votes_school_status_idx
  on public.votes(school_id, status);

create table if not exists public.vote_options (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  name text not null,
  image_url text,
  sort_order integer not null default 0
);
create index if not exists vote_options_vote_idx
  on public.vote_options(vote_id, sort_order);

create table if not exists public.vote_ballots (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  option_id uuid not null references public.vote_options(id) on delete cascade,
  voter_id uuid not null,
  voter_role text,
  voted_at timestamptz not null default now(),
  unique (vote_id, voter_id)
);
create index if not exists vote_ballots_vote_idx
  on public.vote_ballots(vote_id, option_id);
create index if not exists vote_ballots_voter_idx
  on public.vote_ballots(vote_id, voter_id);

alter table public.votes enable row level security;
alter table public.vote_options enable row level security;
alter table public.vote_ballots enable row level security;

-- ---------------------------------------------------------------- 2. RLS - votes
-- Same-school select for every signed-in user; eligibility (who the
-- vote is for) is filtered in the app, not here.
create policy "school votes read" on public.votes
  for select to authenticated
  using (
    public.is_platform_owner()
    or school_id = public.my_school_id()
  );

-- Only the platform owner or the school's own school_admin may
-- create, change or delete a vote.
create policy "school votes insert" on public.votes
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
create policy "school votes update" on public.votes
  for update to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  )
  with check (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );
create policy "school votes delete" on public.votes
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (school_id = public.my_school_id() and public.my_role() = 'school_admin')
  );

-- ---------------------------------------------------------------- 3. RLS - vote_options
-- Options belong to a vote, so the school check goes through it.
create policy "school vote options read" on public.vote_options
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (
      select 1 from public.votes v
      where v.id = vote_options.vote_id
        and v.school_id = public.my_school_id()
    )
  );
create policy "school vote options insert" on public.vote_options
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (
      public.my_role() = 'school_admin'
      and exists (
        select 1 from public.votes v
        where v.id = vote_options.vote_id
          and v.school_id = public.my_school_id()
      )
    )
  );
create policy "school vote options update" on public.vote_options
  for update to authenticated
  using (
    public.is_platform_owner()
    or (
      public.my_role() = 'school_admin'
      and exists (
        select 1 from public.votes v
        where v.id = vote_options.vote_id
          and v.school_id = public.my_school_id()
      )
    )
  )
  with check (
    public.is_platform_owner()
    or (
      public.my_role() = 'school_admin'
      and exists (
        select 1 from public.votes v
        where v.id = vote_options.vote_id
          and v.school_id = public.my_school_id()
      )
    )
  );
create policy "school vote options delete" on public.vote_options
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (
      public.my_role() = 'school_admin'
      and exists (
        select 1 from public.votes v
        where v.id = vote_options.vote_id
          and v.school_id = public.my_school_id()
      )
    )
  );

-- ---------------------------------------------------------------- 4. RLS - vote_ballots
-- Same-school select (an admin reads counts through the app; a
-- voter never sees who voted for what on an anonymous vote because
-- the app only ever shows per-option counts, never ballot rows).
create policy "school vote ballots read" on public.vote_ballots
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (
      select 1 from public.votes v
      where v.id = vote_ballots.vote_id
        and v.school_id = public.my_school_id()
    )
  );

-- Any authenticated user of the same school may cast one ballot of
-- their own. The unique (vote_id, voter_id) constraint enforces one
-- vote per voter; there is deliberately no update or delete policy,
-- so a ballot can never be changed or removed.
create policy "school vote ballots insert" on public.vote_ballots
  for insert to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.votes v
      where v.id = vote_ballots.vote_id
        and v.school_id = public.my_school_id()
        and v.status = 'Open'
    )
    and exists (
      select 1 from public.vote_options o
      where o.id = vote_ballots.option_id
        and o.vote_id = vote_ballots.vote_id
    )
  );
