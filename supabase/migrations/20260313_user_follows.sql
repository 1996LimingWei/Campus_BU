-- User follow relationship table

create table if not exists public.user_follows (
    follower_id   uuid not null references auth.users(id) on delete cascade,
    following_id  uuid not null references auth.users(id) on delete cascade,
    created_at    timestamptz not null default now(),
    primary key (follower_id, following_id),
    constraint user_follows_no_self_follow check (follower_id <> following_id)
);

create index if not exists user_follows_following_idx on public.user_follows (following_id);

alter table public.user_follows enable row level security;

-- Public read for relationship graph / counters
drop policy if exists "user_follows_select_all" on public.user_follows;
create policy "user_follows_select_all"
on public.user_follows
for select
using (true);

-- Users can only create/delete their own following relationships
drop policy if exists "user_follows_insert_own" on public.user_follows;
create policy "user_follows_insert_own"
on public.user_follows
for insert
with check (auth.uid() = follower_id and follower_id <> following_id);

drop policy if exists "user_follows_delete_own" on public.user_follows;
create policy "user_follows_delete_own"
on public.user_follows
for delete
using (auth.uid() = follower_id);
