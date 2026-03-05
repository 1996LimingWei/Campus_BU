-- 复制以下所有代码
-- 进入 Supabase Dashboard -> SQL Editor
-- 点击 "New Query"，粘贴并在右下角点击 "Run"

-- 1. 创建用户档案表 (Public Profiles)
create table if not exists public.users (
  id uuid references auth.users not null primary key,
  display_name text,
  major text,
  avatar_url text,
  social_tags jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 开启用户表安全策略
alter table public.users enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.users;
DROP POLICY IF EXISTS "Users can update own profile." ON public.users;

create policy "Public profiles are viewable by everyone." on public.users for select using ( true );
create policy "Users can insert their own profile." on public.users for insert with check ( auth.uid() = id );
create policy "Users can update own profile." on public.users for update using ( auth.uid() = id );

-- 2. 创建帖子表 (Posts)
create table if not exists public.posts (
  id uuid default gen_random_uuid() primary key,
  content text,
  type text,
  author_id uuid references public.users(id),
  author_name text,
  author_avatar text,
  author_major text,
  author_tags jsonb,
  images jsonb,
  location_tag text,
  lat float,
  lng float,
  likes int default 0,
  comments_count int default 0,
  is_anonymous boolean default false,
  created_at timestamptz default now()
);

-- 开启帖子表安全策略
alter table public.posts enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Posts are viewable by everyone." ON public.posts;
DROP POLICY IF EXISTS "Authenticated users or demo user can insert posts." ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts." ON public.posts;

create policy "Posts are viewable by everyone." on public.posts for select using ( true );
create policy "Authenticated users or demo user can insert posts." on public.posts for insert with check ( auth.role() = 'authenticated' or author_id = 'd3b07384-dead-4bef-cafe-000000000000' );
create policy "Users can update own posts." on public.posts for update using ( auth.uid() = author_id );

-- 新增：帖子评论表
create table if not exists public.post_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade,
  author_id uuid references public.users(id),
  author_name text not null,
  author_avatar text,
  content text not null,
  created_at timestamptz default now()
);
alter table public.post_comments enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Comments are viewable by everyone." ON public.post_comments;
DROP POLICY IF EXISTS "Authenticated users or demo user can comment." ON public.post_comments;

create policy "Comments are viewable by everyone." on public.post_comments for select using ( true );
create policy "Authenticated users or demo user can comment." on public.post_comments for insert with check ( auth.role() = 'authenticated' or author_id = 'd3b07384-dead-4bef-cafe-000000000000' );

-- 新增：帖子点赞表
create table if not exists public.post_likes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.users(id),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Likes are viewable by everyone." ON public.post_likes;
DROP POLICY IF EXISTS "Authenticated users or demo user can like." ON public.post_likes;
DROP POLICY IF EXISTS "Users or demo user can unlike." ON public.post_likes;

create policy "Likes are viewable by everyone." on public.post_likes for select using ( true );
create policy "Authenticated users or demo user can like." on public.post_likes for insert with check ( auth.role() = 'authenticated' or user_id = 'd3b07384-dead-4bef-cafe-000000000000' );
create policy "Users or demo user can unlike." on public.post_likes for delete using ( auth.uid() = user_id or user_id = 'd3b07384-dead-4bef-cafe-000000000000' );

-- 3. 创建互动表 (Interactions: Poke/Wave) - 可选
create table if not exists public.interactions (
  id uuid default gen_random_uuid() primary key,
  from_user_id uuid references public.users(id),
  to_user_id uuid references public.users(id),
  type text,
  message text,
  created_at timestamptz default now(),
  read boolean default false
);
alter table public.interactions enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Users can see interactions sent to them." ON public.interactions;
DROP POLICY IF EXISTS "Users can insert interactions." ON public.interactions;

create policy "Users can see interactions sent to them." on public.interactions for select using ( auth.uid() = to_user_id );
create policy "Users can insert interactions." on public.interactions for insert with check ( auth.role() = 'authenticated' );

-- 4. 聊天消息表 (Messages) - 可选
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id text,
  sender_id uuid references public.users(id),
  content text,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Public read messages" ON public.messages;
DROP POLICY IF EXISTS "Auth send messages" ON public.messages;

create policy "Public read messages" on public.messages for select using (true); -- 简化版，实际应限制房间成员
create policy "Auth send messages" on public.messages for insert with check ( auth.role() = 'authenticated' );

-- 5. 配置 Storage (存储图片)
-- 删除旧策略（如果存在），避免重复运行时出错
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- 创建 campus 存储桶（公开访问）- 用于存储帖子图片、论坛图片、美食图片等
INSERT INTO storage.buckets (id, name, public)
VALUES ('campus', 'campus', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 允许已认证用户上传文件
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campus');

-- 允许所有人读取文件（公开访问）
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'campus');

-- 允许用户删除自己上传的文件
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'campus');

-- 6. 创建课程表 (Courses)
create table if not exists public.courses (
  id text default gen_random_uuid()::text primary key,
  code text unique not null,
  name text,
  instructor text,
  department text,
  credits int default 3,
  rating float default 0,
  review_count int default 0,
  created_at timestamptz default now()
);

alter table public.courses enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Courses are viewable by everyone." ON public.courses;
DROP POLICY IF EXISTS "Anyone can insert courses." ON public.courses;

create policy "Courses are viewable by everyone." on public.courses for select using ( true );
create policy "Anyone can insert courses." on public.courses for insert with check ( true );

-- 7. 课程消息扩展 (Messages Table Already Exists, we use room_id for courses)
-- 8. 课程评价表 (Course Reviews)
create table if not exists public.course_reviews (
  id uuid default gen_random_uuid() primary key,
  course_id text references public.courses(id) on delete cascade,
  author_id uuid references public.users(id),
  author_name text,
  author_avatar text,
  rating int check (rating >= 1 and rating <= 5),
  difficulty int check (difficulty >= 1 and difficulty <= 5),
  content text,
  semester text,
  likes int default 0,
  created_at timestamptz default now()
);

alter table public.course_reviews enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Reviews are viewable by everyone." ON public.course_reviews;
DROP POLICY IF EXISTS "Anyone can insert reviews." ON public.course_reviews;

create policy "Reviews are viewable by everyone." on public.course_reviews for select using ( true );
create policy "Anyone can insert reviews." on public.course_reviews for insert with check ( true );

-- 自动更新课程评分的简单函数 (在实际应用中更推荐使用 Supabase Edge Functions or Triggers)
-- 这里仅作为参考，手动更新即可满足当前需求

-- 开启实时推送 (Realtime)
alter publication supabase_realtime add table messages;

-- 点赞自增/自减函数 (RPC)
create or replace function public.increment_review_likes(review_id uuid)
returns void as $$
begin
  update public.course_reviews
  set likes = likes + 1
  where id = review_id;
end;
$$ language plpgsql security definer;

create or replace function public.decrement_review_likes(review_id uuid)
returns void as $$
begin
  update public.course_reviews
  set likes = case when likes > 0 then likes - 1 else 0 end
  where id = review_id;
end;
$$ language plpgsql security definer;

-- 9. 课程交换表 (Course Exchanges)
create table if not exists public.course_exchanges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id),
  user_name text,
  user_avatar text,
  user_major text,
  have_course text,
  have_section text,
  have_teacher text,
  have_time text,
  want_courses jsonb,
  reason text,
  contacts jsonb,
  status text default 'open',
  comment_count int default 0,
  likes int default 0,
  created_at timestamptz default now()
);

alter table public.course_exchanges enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Exchanges are viewable by everyone." ON public.course_exchanges;
DROP POLICY IF EXISTS "Anyone can insert exchange requests." ON public.course_exchanges;

create policy "Exchanges are viewable by everyone." on public.course_exchanges for select using ( true );
create policy "Anyone can insert exchange requests." on public.course_exchanges for insert with check ( true );

-- 10. 课程交换评论表 (Exchange Comments)
create table if not exists public.exchange_comments (
  id uuid default gen_random_uuid() primary key,
  exchange_id uuid references public.course_exchanges(id) on delete cascade,
  author_id uuid references public.users(id),
  author_name text,
  author_avatar text,
  content text,
  created_at timestamptz default now()
);

alter table public.exchange_comments enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Comments are viewable by everyone." ON public.exchange_comments;
DROP POLICY IF EXISTS "Anyone can insert exchange comments." ON public.exchange_comments;

create policy "Comments are viewable by everyone." on public.exchange_comments for select using ( true );
create policy "Anyone can insert exchange comments." on public.exchange_comments for insert with check ( true );

-- 11. 评论数自增函数 (RPC)
create or replace function public.increment_exchange_comment_count(row_id uuid)
returns void as $$
begin
  update public.course_exchanges
  set comment_count = comment_count + 1
  where id = row_id;
end;
$$ language plpgsql security definer;


-- 12. 建筑位置表 (Buildings)
create table if not exists public.buildings (
  id text primary key,
  name text not null,
  category text,
  description text,
  image_url text,
  lat float,
  lng float,
  is_deleted boolean default false,
  updated_at timestamptz default now()
);

alter table public.buildings enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Buildings are viewable by everyone." ON public.buildings;
DROP POLICY IF EXISTS "Only authenticated users can insert/update buildings." ON public.buildings;

create policy "Buildings are viewable by everyone." on public.buildings for select using ( true );
create policy "Only authenticated users can insert/update buildings." on public.buildings 
  for all using ( auth.role() = 'authenticated' );


-- 13. 课程组队表 (Course Teaming)
create table if not exists public.course_teaming (
  id uuid default gen_random_uuid() primary key,
  course_id text references public.courses(id) on delete cascade,
  user_id uuid references public.users(id),
  user_name text,
  user_avatar text,
  user_major text,
  section text,
  self_intro text,
  target_teammate text,
  contacts jsonb,
  status text default 'open',
  likes int default 0,
  comment_count int default 0,
  created_at timestamptz default now()
);

alter table public.course_teaming enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Teaming requests are viewable by everyone." ON public.course_teaming;
DROP POLICY IF EXISTS "Anyone can insert teaming requests." ON public.course_teaming;

create policy "Teaming requests are viewable by everyone." on public.course_teaming for select using ( true );
create policy "Anyone can insert teaming requests." on public.course_teaming for insert with check ( true );

-- 14. 组队评论表 (Teaming Comments)
create table if not exists public.teaming_comments (
  id uuid default gen_random_uuid() primary key,
  teaming_id uuid references public.course_teaming(id) on delete cascade,
  author_id uuid references public.users(id),
  author_name text,
  author_avatar text,
  content text,
  created_at timestamptz default now()
);

alter table public.teaming_comments enable row level security;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Teaming comments are viewable by everyone." ON public.teaming_comments;
DROP POLICY IF EXISTS "Anyone can insert teaming comments." ON public.teaming_comments;

create policy "Teaming comments are viewable by everyone." on public.teaming_comments for select using ( true );
create policy "Anyone can insert teaming comments." on public.teaming_comments for insert with check ( true );

-- 15. 组队评论数自增函数
create or replace function public.increment_teaming_comment_count(row_id uuid)
returns void as $$
begin
  update public.course_teaming
  set comment_count = comment_count + 1
  where id = row_id;
end;
$$ language plpgsql security definer;
