
-- 0. 开启向量扩展 (PGVector)
create extension if not exists vector;

-- 1. 创建教师表 (Teachers)
create table if not exists public.teachers (
  id uuid default gen_random_uuid() primary key,
  faculty text,
  department text,
  name text not null,
  title text,
  image_url text,
  email text,
  source_url text,
  rating_avg float default 0,
  review_count int default 0,
  tags jsonb default '[]'::jsonb, -- 虎扑式趣味标签
  embedding vector(1536), -- OpenAI embedding 维度
  created_at timestamptz default now()
);

-- 2. 创建教师评价表 (Teacher Reviews)
create table if not exists public.teacher_reviews (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references public.teachers(id) on delete cascade,
  author_id uuid references public.users(id),
  author_name text not null,
  author_avatar text,
  rating int check (rating >= 1 and rating <= 5), -- 评分
  difficulty int check (difficulty >= 1 and difficulty <= 5), -- 难度
  clarity int check (clarity >= 1 and clarity <= 5), -- 清晰度
  workload int check (workload >= 1 and workload <= 5), -- 工作量
  content text not null,
  tags jsonb default '[]'::jsonb, -- 用户选择的标签
  likes int default 0,
  created_at timestamptz default now()
);

-- 3. 创建评价点赞表
create table if not exists public.teacher_review_likes (
  review_id uuid references public.teacher_reviews(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  primary key (review_id, user_id)
);

-- 4. 开启 RLS
alter table public.teachers enable row level security;
alter table public.teacher_reviews enable row level security;
alter table public.teacher_review_likes enable row level security;

-- 5. 删除旧策略（如果存在），避免重复运行时出错
DROP POLICY IF EXISTS "Teachers are viewable by everyone" ON public.teachers;
DROP POLICY IF EXISTS "Teacher reviews are viewable by everyone" ON public.teacher_reviews;
DROP POLICY IF EXISTS "Authenticated users can post reviews" ON public.teacher_reviews;
DROP POLICY IF EXISTS "Authors can delete their own reviews" ON public.teacher_reviews;
DROP POLICY IF EXISTS "Review likes are viewable by everyone" ON public.teacher_review_likes;
DROP POLICY IF EXISTS "Authenticated users can like reviews" ON public.teacher_review_likes;
DROP POLICY IF EXISTS "Users can unlike reviews" ON public.teacher_review_likes;

-- 6. 创建策略
create policy "Teachers are viewable by everyone" on public.teachers for select using (true);
create policy "Teacher reviews are viewable by everyone" on public.teacher_reviews for select using (true);
create policy "Authenticated users can post reviews" on public.teacher_reviews for insert with check (auth.role() = 'authenticated');
create policy "Authors can delete their own reviews" on public.teacher_reviews for delete using (auth.uid() = author_id);

create policy "Review likes are viewable by everyone" on public.teacher_review_likes for select using (true);
create policy "Authenticated users can like reviews" on public.teacher_review_likes for insert with check (auth.role() = 'authenticated');
create policy "Users can unlike reviews" on public.teacher_review_likes for delete using (auth.uid() = user_id);

-- 7. RPC 点赞函数
create or replace function public.increment_teacher_review_likes(rid uuid)
returns void as $$
begin
  update public.teacher_reviews
  set likes = likes + 1
  where id = rid;
end;
$$ language plpgsql security definer;

create or replace function public.decrement_teacher_review_likes(rid uuid)
returns void as $$
begin
  update public.teacher_reviews
  set likes = likes - 1
  where id = rid;
end;
$$ language plpgsql security definer;

-- 7. 向量检索函数 (Interview Highlight)
-- 面试时可以演示：如何通过语义搜索老师（比如搜索“人工智能专家”）
create or replace function public.match_teachers (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  name text,
  faculty text,
  department text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    teachers.id,
    teachers.name,
    teachers.faculty,
    teachers.department,
    1 - (teachers.embedding <=> query_embedding) as similarity
  from teachers
  where 1 - (teachers.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;
