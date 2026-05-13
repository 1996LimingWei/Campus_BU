-- 创建用户课表存储表
create table if not exists public.user_schedules (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    course_name text,
    course_code text,
    room text,
    time_slot text,
    raw_ocr_data jsonb,
    created_at timestamptz default now()
);

-- 开启 RLS
alter table public.user_schedules enable row level security;

-- 策略
create policy "Users can view their own schedules" on public.user_schedules
    for select using (auth.uid() = user_id);

create policy "Users can insert their own schedules" on public.user_schedules
    for insert with check (auth.uid() = user_id);

-- Data API GRANT（私有用户数据，不给 anon）
grant select, insert, update, delete on public.user_schedules to authenticated;
grant select, insert, update, delete on public.user_schedules to service_role;
