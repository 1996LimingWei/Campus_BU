-- 创建 teaming-avatars 存储桶设置
-- 运行此 SQL 在 Supabase SQL Editor 中创建存储桶和权限策略

-- 0. 删除旧策略（如果存在），避免重复运行时出错
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own files" ON storage.objects;

-- 1. 创建 teaming-avatars 存储桶（公开访问）
INSERT INTO storage.buckets (id, name, public)
VALUES ('teaming-avatars', 'teaming-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. 允许所有已认证用户上传文件
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'teaming-avatars');

-- 3. 允许所有人读取文件（公开访问）
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'teaming-avatars');

-- 4. 允许用户删除自己上传的文件
CREATE POLICY "Allow users to delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'teaming-avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);
