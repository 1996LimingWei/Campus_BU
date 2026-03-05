-- 修复脚本：重新设置用户头像存储桶
-- 如果检查脚本发现问题，运行此脚本修复

-- 步骤 1: 删除可能存在冲突的旧策略
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- 步骤 2: 确保存储桶存在且配置正确
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'user-avatars', 
    'user-avatars', 
    true,
    5242880, -- 5MB 限制
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) 
DO UPDATE SET 
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- 步骤 3: 重新创建 RLS 策略

-- 3.1 允许已认证用户上传到自己的文件夹
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'user-avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3.2 允许已认证用户更新自己的头像
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

-- 3.3 允许所有人读取头像（公开访问）
CREATE POLICY "Anyone can read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-avatars');

-- 3.4 允许用户删除自己的头像
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'user-avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 步骤 4: 验证配置
SELECT 
    'Bucket exists: ' || CASE WHEN EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'user-avatars'
    ) THEN 'YES ✓' ELSE 'NO ✗' END as status
UNION ALL
SELECT 
    'Policies count: ' || COUNT(*)::text || ' (expected: 4)'
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects' 
  AND policyname IN (
      'Users can upload own avatar',
      'Users can update own avatar',
      'Anyone can read avatars',
      'Users can delete own avatar'
  );
