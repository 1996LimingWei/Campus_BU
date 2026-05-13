-- setup_food_reviews.sql

-- 1. Create Food Reviews Table
create table if not exists public.food_reviews (
  id uuid default gen_random_uuid() primary key,
  outlet_id text not null, -- Links to 'o1', 'o2', etc.
  author_id uuid references public.users(id),
  author_name text not null,
  author_avatar text,
  rating int check (rating >= 1 and rating <= 5),
  content text not null,
  images jsonb default '[]'::jsonb,
  likes int default 0,
  created_at timestamptz default now()
);

-- 2. Create Food Review Likes Table (to prevent double liking)
create table if not exists public.food_review_likes (
  review_id uuid references public.food_reviews(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  primary key (review_id, user_id)
);

-- 3. Enable RLS
alter table public.food_reviews enable row level security;
alter table public.food_review_likes enable row level security;

-- 4. Policies
create policy "Food reviews are viewable by everyone" on public.food_reviews for select using (true);
create policy "Authenticated users can post food reviews" on public.food_reviews for insert with check (auth.role() = 'authenticated' and (auth.uid() = author_id or author_id is null));
create policy "Authors can delete their own food reviews" on public.food_reviews for delete using (auth.uid() = author_id);

create policy "Likes are viewable by everyone" on public.food_review_likes for select using (true);
create policy "Authenticated users can like reviews" on public.food_review_likes for insert with check (auth.role() = 'authenticated');
create policy "Users can unlike reviews" on public.food_review_likes for delete using (auth.uid() = user_id);

-- 5. RPC Functions for Atomic Like Counter
create or replace function public.increment_food_review_likes(rid uuid)
returns void as $$
begin
  update public.food_reviews
  set likes = likes + 1
  where id = rid;
end;
$$ language plpgsql security definer;

create or replace function public.decrement_food_review_likes(rid uuid)
returns void as $$
begin
  update public.food_reviews
  set likes = case when likes > 0 then likes - 1 else 0 end
  where id = rid;
end;
$$ language plpgsql security definer;

-- 6. Food Review Comments Table (Replies)
create table if not exists public.food_review_comments (
  id uuid default gen_random_uuid() primary key,
  review_id uuid references public.food_reviews(id) on delete cascade,
  author_id uuid references public.users(id),
  author_name text not null,
  author_avatar text,
  content text not null,
  created_at timestamptz default now()
);

alter table public.food_review_comments enable row level security;
create policy "Comments are viewable by everyone" on public.food_review_comments for select using (true);
create policy "Authenticated users can reply to reviews" on public.food_review_comments for insert with check (auth.role() = 'authenticated' and (auth.uid() = author_id or author_id is null));
create policy "Authors can delete their own replies" on public.food_review_comments for delete using (auth.uid() = author_id);

-- 7. Data API GRANT（公开数据，anon 可读）
grant select                                                     on public.food_reviews        to anon;
grant select, insert, update, delete                             on public.food_reviews        to authenticated;
grant select, insert, update, delete                             on public.food_reviews        to service_role;

grant select                                                     on public.food_review_likes   to anon;
grant select, insert, update, delete                             on public.food_review_likes   to authenticated;
grant select, insert, update, delete                             on public.food_review_likes   to service_role;

grant select                                                     on public.food_review_comments to anon;
grant select, insert, update, delete                             on public.food_review_comments to authenticated;
grant select, insert, update, delete                             on public.food_review_comments to service_role;
