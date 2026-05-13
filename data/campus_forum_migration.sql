-- -----------------------------------------------------------------------------
-- CAMPUS FORUM UPGRADE MIGRATION
-- Enhances the existing 'posts' table and adds 'post_comments'.
-- -----------------------------------------------------------------------------

-- 1. Enhance Posts Table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_major text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count int DEFAULT 0;

-- 2. Post Comments Table
CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id), -- Match existing schema
  author_name text NOT NULL,
  author_avatar text,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. Post Likes (User-specific tracking)
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- 4. Enable RLS
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- Policies for Comments
CREATE POLICY "Anyone can view comments." ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment." ON public.post_comments FOR INSERT WITH CHECK (true);

-- Policies for Likes
CREATE POLICY "Anyone can view likes." ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like." ON public.post_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can unlike." ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- 5. Enable Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;

-- 6. Data API GRANT（公开数据，anon 可读）
grant select                                                     on public.post_comments to anon;
grant select, insert, update, delete                             on public.post_comments to authenticated;
grant select, insert, update, delete                             on public.post_comments to service_role;

grant select                                                     on public.post_likes    to anon;
grant select, insert, update, delete                             on public.post_likes    to authenticated;
grant select, insert, update, delete                             on public.post_likes    to service_role;
