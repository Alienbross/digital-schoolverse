-- Digital SchoolVerse - migration 0007: admission form fees & document uploads
-- Run in the Supabase SQL editor AFTER 0006_registration_approvals.sql.
-- This migration does NOT edit 0001-0006.
--
-- What it does:
--   1. schools gains admission_fee_amount (naira, default 0) and
--      admission_fee_required (default false). The school admin sets
--      both under School Setup; when the fee is off, applying is free.
--   2. admission_applications (migration 0001) gains fee_status
--      (Free | Paid | Unpaid, default 'Free'), fee_amount,
--      fee_reference (ADM-PAY-YYYY-NNNN, test checkout only) and
--      fee_channel (Card | Bank transfer).
--   3. New table admission_documents: one row per uploaded file
--      (birth certificate, previous result, passport photo, other),
--      linked to its application, with a review status
--      (Pending | Verified | Rejected) and a review note.
--   4. New PRIVATE Storage bucket `admission-documents` (max 5 MB,
--      PDF / JPG / PNG only). No public read: only the platform owner
--      or that school's school_admin may read or delete files, via a
--      signed URL. Anyone (anon) may upload, because the public apply
--      form uploads before sign-in.
--   5. Public (anon) submit path: a SECURITY DEFINER RPC
--      `submit_admission_application(...)` creates the application
--      and issues its ADM-2026-NNNN reference in one call, so the
--      public form never writes the table directly. Document rows are
--      inserted by anon through a policy whose check runs through a
--      SECURITY DEFINER helper (anon has no select on
--      admission_applications, so a plain EXISTS check would fail).
--   6. Public (anon) lookup `school_admission_settings(slug)`:
--      school branding, current term, classes and the admission fee
--      settings, so the public apply form can render before sign-in.
--      Same pattern as school_registration_status (0006).
--
-- Money note: the checkout on the apply form is a TEST checkout only
-- (same pattern as the parent fee payment). It records a test payment
-- reference; no real money moves and no live Paystack keys are used.

-- ---------------------------------------------------------------- 1. school fee setting
alter table public.schools
  add column if not exists admission_fee_amount numeric(12,2) not null default 0
    check (admission_fee_amount >= 0);
alter table public.schools
  add column if not exists admission_fee_required boolean not null default false;

-- ---------------------------------------------------------------- 2. fee columns on applications
alter table public.admission_applications
  add column if not exists fee_status text not null default 'Free'
    check (fee_status in ('Free', 'Paid', 'Unpaid'));
alter table public.admission_applications
  add column if not exists fee_amount numeric(12,2)
    check (fee_amount is null or fee_amount >= 0);
alter table public.admission_applications
  add column if not exists fee_reference text;
alter table public.admission_applications
  add column if not exists fee_channel text
    check (fee_channel is null or fee_channel in ('Card', 'Bank transfer'));

-- One test-payment reference belongs to one application only.
create unique index if not exists admissions_fee_reference_idx
  on public.admission_applications (fee_reference)
  where fee_reference is not null;

-- ---------------------------------------------------------------- 3. admission_documents table
create table if not exists public.admission_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  kind text not null check (kind in ('Birth certificate', 'Previous result', 'Passport photo', 'Other')),
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'Pending'
    check (status in ('Pending', 'Verified', 'Rejected')),
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists admission_documents_application_idx
  on public.admission_documents (application_id);
create index if not exists admission_documents_school_idx
  on public.admission_documents (school_id, status);

alter table public.admission_documents enable row level security;

-- Helper: does this application belong to this school? SECURITY
-- DEFINER so the anon document-insert policy below can check it
-- (anon cannot select admission_applications under RLS).
create or replace function public.application_belongs_to_school(
  p_application_id uuid, p_school_id uuid
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admission_applications a
    where a.id = p_application_id and a.school_id = p_school_id
  );
$$;

-- Public apply form (anon) may insert a document row for a real
-- application of that school. It may not read, change or delete rows.
drop policy if exists "admission documents anon insert" on public.admission_documents;
create policy "admission documents anon insert" on public.admission_documents
  for insert to anon
  with check (
    public.application_belongs_to_school(application_id, school_id)
  );

-- Read: platform owner, or anyone in the application's school.
drop policy if exists "admission documents school read" on public.admission_documents;
create policy "admission documents school read" on public.admission_documents
  for select to authenticated
  using (
    public.is_platform_owner()
    or exists (
      select 1 from public.admission_applications a
      where a.id = admission_documents.application_id
        and a.school_id = public.my_school_id()
    )
  );

-- Update / delete: platform owner, or that school's school_admin.
drop policy if exists "admission documents admin write" on public.admission_documents;
create policy "admission documents admin write" on public.admission_documents
  for update to authenticated
  using (
    public.is_platform_owner()
    or (
      public.my_role() = 'school_admin'
      and exists (
        select 1 from public.admission_applications a
        where a.id = admission_documents.application_id
          and a.school_id = public.my_school_id()
      )
    )
  )
  with check (
    public.is_platform_owner()
    or (
      public.my_role() = 'school_admin'
      and exists (
        select 1 from public.admission_applications a
        where a.id = admission_documents.application_id
          and a.school_id = public.my_school_id()
      )
    )
  );
drop policy if exists "admission documents admin delete" on public.admission_documents;
create policy "admission documents admin delete" on public.admission_documents
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (
      public.my_role() = 'school_admin'
      and exists (
        select 1 from public.admission_applications a
        where a.id = admission_documents.application_id
          and a.school_id = public.my_school_id()
      )
    )
  );

-- ---------------------------------------------------------------- 4. private storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admission-documents',
  'admission-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

-- Upload: anyone (the public apply form uploads before sign-in).
-- Files live at <school_id>/<application_id>/<file> - the first
-- folder is the school id, the second the application id.
drop policy if exists "admission documents upload public" on storage.objects;
create policy "admission documents upload public" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'admission-documents');

-- Read: platform owner, or that school's school_admin only.
-- No public read: files are opened through signed URLs.
drop policy if exists "admission documents read owner or own admin" on storage.objects;
create policy "admission documents read owner or own admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'admission-documents'
    and (
      public.is_platform_owner()
      or (
        public.my_role() = 'school_admin'
        and public.my_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

-- Delete: same rule as read.
drop policy if exists "admission documents delete owner or own admin" on storage.objects;
create policy "admission documents delete owner or own admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'admission-documents'
    and (
      public.is_platform_owner()
      or (
        public.my_role() = 'school_admin'
        and public.my_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

-- ---------------------------------------------------------------- 5. public submit RPC
-- Creates one application and issues its ADM-YYYY-NNNN reference.
-- Returns { ok, application_id, reference, fee_reference } or
-- { ok: false, error }.
-- The test-checkout fee is recorded here in the same call: when the
-- school's fee is on, the caller must pass fee_status 'Paid'; the
-- ADM-PAY-YYYY-NNNN reference is generated here, server-side, so it
-- stays unique (an anonymous applicant cannot count the table under
-- RLS). When the fee is off, the application is Free. No real payment
-- is taken anywhere.
create or replace function public.submit_admission_application(
  p_school_id uuid,
  p_child_first_name text,
  p_child_last_name text,
  p_class_id uuid,
  p_entry_term_id uuid,
  p_parent_name text,
  p_parent_phone text,
  p_parent_email text,
  p_previous_school text,
  p_notes text,
  p_source text,
  p_fee_status text,
  p_fee_amount numeric,
  p_fee_reference text,
  p_fee_channel text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_school public.schools%rowtype;
  v_ref text;
  v_seq int;
  v_id uuid;
  v_fee_status text := coalesce(nullif(trim(p_fee_status), ''), 'Free');
begin
  select * into v_school from public.schools where id = p_school_id;
  if v_school.id is null then
    return jsonb_build_object('ok', false, 'error', 'School not found.');
  end if;

  if trim(coalesce(p_child_first_name, '')) = ''
     or trim(coalesce(p_child_last_name, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter the child''s first and last name.');
  end if;

  if p_class_id is not null and not exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.school_id = p_school_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'That class does not belong to this school.');
  end if;

  if p_entry_term_id is not null and not exists (
    select 1 from public.terms t
    where t.id = p_entry_term_id and t.school_id = p_school_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'That term does not belong to this school.');
  end if;

  if v_fee_status not in ('Free', 'Paid', 'Unpaid') then
    return jsonb_build_object('ok', false, 'error', 'Unknown fee status.');
  end if;

  -- Fee on at this school: only a Paid application is accepted.
  if v_school.admission_fee_required and coalesce(v_school.admission_fee_amount, 0) > 0 then
    if v_fee_status <> 'Paid' then
      return jsonb_build_object('ok', false, 'error', 'This school charges an admission form fee. Complete the test checkout first.');
    end if;
    if coalesce(p_fee_amount, 0) <> v_school.admission_fee_amount then
      return jsonb_build_object('ok', false, 'error', 'The fee amount does not match the school''s admission form fee.');
    end if;
    -- Test-payment reference, issued server-side so it stays unique.
    select count(*) + 1 into v_seq
      from public.admission_applications
      where school_id = p_school_id and fee_reference is not null;
    p_fee_reference := 'ADM-PAY-' || extract(year from now())::text || '/' ||
                       lpad(v_seq::text, 4, '0');
  else
    -- Fee off: the application is free whatever the caller passed.
    v_fee_status := 'Free';
    p_fee_amount := null;
    p_fee_reference := null;
    p_fee_channel := null;
  end if;

  select count(*) + 1 into v_seq
    from public.admission_applications
    where school_id = p_school_id;
  v_ref := 'ADM-' || extract(year from now())::text || '/' ||
           lpad(v_seq::text, 4, '0');

  insert into public.admission_applications (
    school_id, reference, child_first_name, child_last_name,
    class_id, entry_term_id, parent_name, parent_phone, parent_email,
    previous_school, notes, source, status,
    fee_status, fee_amount, fee_reference, fee_channel
  ) values (
    p_school_id, v_ref, trim(p_child_first_name), trim(p_child_last_name),
    p_class_id, p_entry_term_id,
    nullif(trim(coalesce(p_parent_name, '')), ''),
    nullif(trim(coalesce(p_parent_phone, '')), ''),
    nullif(trim(coalesce(p_parent_email, '')), ''),
    nullif(trim(coalesce(p_previous_school, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(nullif(trim(p_source), ''), 'Online form'),
    'Submitted',
    v_fee_status, p_fee_amount,
    nullif(trim(coalesce(p_fee_reference, '')), ''),
    p_fee_channel
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'application_id', v_id,
    'reference', v_ref,
    'fee_reference', p_fee_reference
  );
end;
$$;
grant execute on function public.submit_admission_application(uuid, text, text, uuid, uuid, text, text, text, text, text, text, text, numeric, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- 6. public settings RPC
-- School branding + current term + classes + admission fee settings,
-- for /<slug>/admissions/apply. Returns null when no school has that
-- slug. Never returns emails, phones, plan or status - same rule as
-- school_registration_status (0006).
create or replace function public.school_admission_settings(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'school', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name,
      'motto', s.motto, 'logo_url', s.logo_url
    ),
    'fee', jsonb_build_object(
      'required', s.admission_fee_required,
      'amount', s.admission_fee_amount
    ),
    'current_term', (
      select jsonb_build_object('id', t.id, 'session', t.session, 'name', t.name)
      from public.terms t
      where t.school_id = s.id and t.is_current
      limit 1
    ),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'session', t.session, 'name', t.name, 'is_current', t.is_current
      ) order by t.created_at)
      from public.terms t where t.school_id = s.id
    ), '[]'::jsonb),
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
grant execute on function public.school_admission_settings(text) to anon, authenticated;
