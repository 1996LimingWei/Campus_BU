-- Forum feature: independent tables separate from the 'posts' (发现) board

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. forum_posts
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.forum_posts (
    id              uuid primary key default gen_random_uuid(),
    title           text not null,
    content         text,
    author_id       uuid not null references auth.users(id) on delete cascade,
    author_name     text not null,
    author_email    text,
    author_avatar   text,
    category        text not null default 'general'
                        check (category in ('general','activity','guide','lost_found')),
    images          jsonb default '[]'::jsonb,
    reply_count     integer not null default 0,
    upvote_count    integer not null default 0,
    last_reply_at   timestamptz not null default now(),
    created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. forum_comments
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.forum_comments (
    id              uuid primary key default gen_random_uuid(),
    post_id         uuid not null references public.forum_posts(id) on delete cascade,
    author_id       uuid not null references auth.users(id) on delete cascade,
    author_name     text not null,
    author_email    text,
    author_avatar   text,
    content         text not null,
    created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. forum_upvotes  (composite PK prevents double-upvoting)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.forum_upvotes (
    post_id   uuid not null references public.forum_posts(id) on delete cascade,
    user_id   uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (post_id, user_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.forum_posts     enable row level security;
alter table public.forum_comments  enable row level security;
alter table public.forum_upvotes   enable row level security;

-- forum_posts: public read, authenticated insert, own update/delete
create policy "forum_posts_select_all"
    on public.forum_posts for select using (true);

create policy "forum_posts_insert_auth"
    on public.forum_posts for insert
    with check (auth.uid() = author_id);

create policy "forum_posts_delete_own"
    on public.forum_posts for delete
    using (auth.uid() = author_id);

create policy "forum_posts_update_own"
    on public.forum_posts for update
    using (auth.uid() = author_id);

-- Allow incrementing counts by any authenticated user (via service functions)
create policy "forum_posts_update_counts"
    on public.forum_posts for update
    using (auth.uid() is not null);

-- forum_comments: public read, authenticated insert, own delete
create policy "forum_comments_select_all"
    on public.forum_comments for select using (true);

create policy "forum_comments_insert_auth"
    on public.forum_comments for insert
    with check (auth.uid() = author_id);

create policy "forum_comments_delete_own"
    on public.forum_comments for delete
    using (auth.uid() = author_id);

-- forum_upvotes: own rows only
create policy "forum_upvotes_select_own"
    on public.forum_upvotes for select using (auth.uid() = user_id);

create policy "forum_upvotes_insert_own"
    on public.forum_upvotes for insert
    with check (auth.uid() = user_id);

create policy "forum_upvotes_delete_own"
    on public.forum_upvotes for delete
    using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Indexes for common queries
-- ──────────────────────────────────────────────────────────────────────────────
create index if not exists forum_posts_last_reply_idx  on public.forum_posts (last_reply_at desc);
create index if not exists forum_posts_created_at_idx  on public.forum_posts (created_at desc);
create index if not exists forum_posts_category_idx    on public.forum_posts (category);
create index if not exists forum_comments_post_idx     on public.forum_comments (post_id, created_at);
