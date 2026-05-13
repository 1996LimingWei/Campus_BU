-- Favorites tables for courses and buildings

create table if not exists public.course_favorites (
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, course_id)
);

create table if not exists public.building_favorites (
    user_id uuid not null references auth.users(id) on delete cascade,
    building_id text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, building_id)
);

alter table public.course_favorites enable row level security;
alter table public.building_favorites enable row level security;

-- Policies: users can only access their own favorites
create policy "course_favorites_select_own"
on public.course_favorites
for select
using (auth.uid() = user_id);

create policy "course_favorites_insert_own"
on public.course_favorites
for insert
with check (auth.uid() = user_id);

create policy "course_favorites_update_own"
on public.course_favorites
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "course_favorites_delete_own"
on public.course_favorites
for delete
using (auth.uid() = user_id);

create policy "building_favorites_select_own"
on public.building_favorites
for select
using (auth.uid() = user_id);

create policy "building_favorites_insert_own"
on public.building_favorites
for insert
with check (auth.uid() = user_id);

create policy "building_favorites_update_own"
on public.building_favorites
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "building_favorites_delete_own"
on public.building_favorites
for delete
using (auth.uid() = user_id);

-- Data API GRANT（私有用户数据，不给 anon）
grant select, insert, update, delete on public.course_favorites to authenticated;
grant select, insert, update, delete on public.course_favorites to service_role;

grant select, insert, update, delete on public.building_favorites to authenticated;
grant select, insert, update, delete on public.building_favorites to service_role;
