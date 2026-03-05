-- 用户头像存储桶设置 (User Avatars Storage Bucket)
-- 运行此 SQL 在 Supabase SQL Editor 中创建存储桶和权限策略

-- 0. 删除旧策略（如果存在），避免重复运行时出错
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- 1. 创建 user-avatars 存储桶 (公开访问)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-avatars', 'user-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. 允许已认证用户上传自己的头像
-- 用户只能上传到自己的文件夹 (以用户ID命名)
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'user-avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. 允许已认证用户更新自己的头像
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'user-avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'user-avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. 允许所有人读取头像（公开访问）
CREATE POLICY "Anyone can read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-avatars');

-- 5. 允许用户删除自己的头像
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'user-avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);
