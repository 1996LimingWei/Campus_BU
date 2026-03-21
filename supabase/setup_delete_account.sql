-- ==========================================
-- 账号级联删除功能 (Cascade Delete User)
-- ==========================================
-- 请在 Supabase 的 SQL Editor 中运行此脚本。

-- 1. 创建 delete_user() RPC 函数
-- 允许用户自己在前端通过 supabase.rpc('delete_user') 来删除自己的 auth.users 记录。
-- 必须使用 SECURITY DEFINER，赋予函数绕过 RLS 删除 auth.users 的权限。
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void AS $$
BEGIN
  -- 删除当前请求的用户。 auth.uid() 会获取前端当前登录的用户 ID。
  -- 注意：从 auth.users 中删除记录，将会触发与之相连的级联删除（如果外键设置了 ON DELETE CASCADE）。
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 2. 检查并开启你现有数据表的外键级联删除
-- ==========================================
-- Supabase 默认情况下，如果关联外键没有加上 "ON DELETE CASCADE"，删除 auth.users 会报错（因为有数据引用它）。
-- 如果你这几张表（例如 posts, comments, likes 等）已经设置了的话，下面的可以不用跑。
-- 
-- 下面是一个【示例】：如何将你的 public.users 表关联到 auth.users 并开启级联删除
/*
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_id_fkey, -- 删掉旧的外键（名字根据你实际的来，默认通常是 table_column_fkey）
  ADD CONSTRAINT users_id_fkey 
  FOREIGN KEY (id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE; -- 关键在这里：级联删除

-- 同样的，假如你有一个 posts 表引用了 public.users
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_author_id_fkey,
  ADD CONSTRAINT posts_author_id_fkey 
  FOREIGN KEY (author_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

-- 假如你有一个 comments 表引用了 posts
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_post_id_fkey,
  ADD CONSTRAINT comments_post_id_fkey 
  FOREIGN KEY (post_id) 
  REFERENCES public.posts(id) 
  ON DELETE CASCADE;
*/
