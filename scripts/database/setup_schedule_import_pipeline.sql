-- Personal schedule import pipeline
-- Covers:
-- 1. Private screenshot uploads
-- 2. OCR import jobs
-- 3. OCR extracted course candidates
-- 4. Final user schedule entries
-- 5. Backfill from legacy public.user_schedules if that table exists

begin;

-- Reusable timestamp trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Storage bucket for private schedule screenshots
-- ---------------------------------------------------------------------------

drop policy if exists "schedule_screenshots_upload_own" on storage.objects;
drop policy if exists "schedule_screenshots_select_own" on storage.objects;
drop policy if exists "schedule_screenshots_update_own" on storage.objects;
drop policy if exists "schedule_screenshots_delete_own" on storage.objects;

insert into storage.buckets (id, name, public)
values ('schedule-screenshots', 'schedule-screenshots', false)
on conflict (id) do update
set public = false;

create policy "schedule_screenshots_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'schedule-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "schedule_screenshots_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'schedule-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "schedule_screenshots_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'schedule-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'schedule-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "schedule_screenshots_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'schedule-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- Import jobs: one screenshot import attempt per upload
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  screenshot_path text not null,
  screenshot_url text,
  image_hash text,
  template_key text not null default 'hkbu_standard_v1',
  semester_label text,
  academic_year text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'processed', 'partially_resolved', 'completed', 'failed')),
  ocr_engine text,
  error_message text,
  recognized_count int not null default 0,
  unresolved_count int not null default 0,
  raw_ocr_payload jsonb not null default '{}'::jsonb,
  screenshot_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_import_jobs enable row level security;

drop policy if exists "schedule_import_jobs_select_own" on public.schedule_import_jobs;
drop policy if exists "schedule_import_jobs_insert_own" on public.schedule_import_jobs;
drop policy if exists "schedule_import_jobs_update_own" on public.schedule_import_jobs;
drop policy if exists "schedule_import_jobs_delete_own" on public.schedule_import_jobs;

create policy "schedule_import_jobs_select_own"
on public.schedule_import_jobs
for select
using (auth.uid() = user_id);

create policy "schedule_import_jobs_insert_own"
on public.schedule_import_jobs
for insert
with check (auth.uid() = user_id);

create policy "schedule_import_jobs_update_own"
on public.schedule_import_jobs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "schedule_import_jobs_delete_own"
on public.schedule_import_jobs
for delete
using (auth.uid() = user_id);

create index if not exists schedule_import_jobs_user_created_idx
  on public.schedule_import_jobs (user_id, created_at desc);

create index if not exists schedule_import_jobs_status_idx
  on public.schedule_import_jobs (status, created_at desc);

drop trigger if exists set_schedule_import_jobs_updated_at on public.schedule_import_jobs;
create trigger set_schedule_import_jobs_updated_at
before update on public.schedule_import_jobs
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Import items: OCR candidates that may still need manual confirmation
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_import_items (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.schedule_import_jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  row_index int,
  source_block text,
  extracted_course_name text,
  extracted_course_code text,
  extracted_teacher text,
  extracted_room text,
  extracted_day_of_week smallint check (extracted_day_of_week between 1 and 7),
  extracted_start_time time,
  extracted_end_time time,
  extracted_start_period smallint,
  extracted_end_period smallint,
  extracted_week_text text,
  matched_course_id text references public.courses(id) on delete set null,
  match_method text
    check (match_method in ('ocr_exact', 'ocr_fuzzy', 'manual_search', 'manual_custom')),
  confidence numeric(5,4) check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'confirmed', 'needs_manual_match', 'ignored')),
  reviewer_note text,
  raw_item jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_import_items enable row level security;

drop policy if exists "schedule_import_items_select_own" on public.schedule_import_items;
drop policy if exists "schedule_import_items_insert_own" on public.schedule_import_items;
drop policy if exists "schedule_import_items_update_own" on public.schedule_import_items;
drop policy if exists "schedule_import_items_delete_own" on public.schedule_import_items;

create policy "schedule_import_items_select_own"
on public.schedule_import_items
for select
using (auth.uid() = user_id);

create policy "schedule_import_items_insert_own"
on public.schedule_import_items
for insert
with check (auth.uid() = user_id);

create policy "schedule_import_items_update_own"
on public.schedule_import_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "schedule_import_items_delete_own"
on public.schedule_import_items
for delete
using (auth.uid() = user_id);

create index if not exists schedule_import_items_job_idx
  on public.schedule_import_items (import_job_id, row_index);

create index if not exists schedule_import_items_user_status_idx
  on public.schedule_import_items (user_id, status, created_at desc);

create index if not exists schedule_import_items_matched_course_idx
  on public.schedule_import_items (matched_course_id);

drop trigger if exists set_schedule_import_items_updated_at on public.schedule_import_items;
create trigger set_schedule_import_items_updated_at
before update on public.schedule_import_items
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Final schedule entries: the actual classes rendered in "My Schedule"
-- ---------------------------------------------------------------------------

create table if not exists public.user_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  import_job_id uuid references public.schedule_import_jobs(id) on delete set null,
  import_item_id uuid references public.schedule_import_items(id) on delete set null,
  matched_course_id text references public.courses(id) on delete set null,
  source text not null default 'manual_custom'
    check (source in ('ocr', 'manual_search', 'manual_custom')),
  title text not null,
  course_code text,
  teacher_name text,
  room text,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time,
  end_time time,
  start_period smallint,
  end_period smallint,
  week_text text,
  week_pattern jsonb not null default '[]'::jsonb,
  section_label text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_schedule_entries_time_or_period_check check (
    (start_time is not null and end_time is not null)
    or (start_period is not null and end_period is not null)
    or week_text is not null
  )
);

alter table public.user_schedule_entries enable row level security;

drop policy if exists "user_schedule_entries_select_own" on public.user_schedule_entries;
drop policy if exists "user_schedule_entries_insert_own" on public.user_schedule_entries;
drop policy if exists "user_schedule_entries_update_own" on public.user_schedule_entries;
drop policy if exists "user_schedule_entries_delete_own" on public.user_schedule_entries;

create policy "user_schedule_entries_select_own"
on public.user_schedule_entries
for select
using (auth.uid() = user_id);

create policy "user_schedule_entries_insert_own"
on public.user_schedule_entries
for insert
with check (auth.uid() = user_id);

create policy "user_schedule_entries_update_own"
on public.user_schedule_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_schedule_entries_delete_own"
on public.user_schedule_entries
for delete
using (auth.uid() = user_id);

create index if not exists user_schedule_entries_user_day_time_idx
  on public.user_schedule_entries (user_id, day_of_week, start_time, start_period);

create index if not exists user_schedule_entries_course_idx
  on public.user_schedule_entries (matched_course_id);

create unique index if not exists user_schedule_entries_active_dedupe_idx
  on public.user_schedule_entries (
    user_id,
    coalesce(matched_course_id, ''),
    coalesce(course_code, ''),
    title,
    day_of_week,
    coalesce(start_time, '00:00:00'::time),
    coalesce(end_time, '00:00:00'::time),
    coalesce(start_period, 0),
    coalesce(end_period, 0),
    coalesce(room, '')
  )
  where is_active = true;

drop trigger if exists set_user_schedule_entries_updated_at on public.user_schedule_entries;
create trigger set_user_schedule_entries_updated_at
before update on public.user_schedule_entries
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Legacy backfill: keep existing user_schedules data usable
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.user_schedules') is not null then
    insert into public.user_schedule_entries (
      user_id,
      source,
      title,
      course_code,
      room,
      day_of_week,
      start_period,
      end_period,
      week_text,
      note,
      created_at,
      updated_at
    )
    select
      us.user_id,
      'manual_custom',
      coalesce(nullif(us.course_name, ''), 'Untitled Course'),
      nullif(us.course_code, ''),
      nullif(us.room, ''),
      1,
      null,
      null,
      us.time_slot,
      'migrated from legacy user_schedules',
      coalesce(us.created_at, now()),
      coalesce(us.created_at, now())
    from public.user_schedules us
    where not exists (
      select 1
      from public.user_schedule_entries e
      where e.user_id = us.user_id
        and e.title = coalesce(nullif(us.course_name, ''), 'Untitled Course')
        and coalesce(e.course_code, '') = coalesce(nullif(us.course_code, ''), '')
        and coalesce(e.room, '') = coalesce(nullif(us.room, ''), '')
        and coalesce(e.week_text, '') = coalesce(us.time_slot, '')
        and e.note = 'migrated from legacy user_schedules'
    );
  end if;
end $$;

commit;
