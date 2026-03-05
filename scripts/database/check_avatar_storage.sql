-- 诊断脚本：检查用户头像存储桶配置
-- 在 Supabase SQL Editor 中运行此脚本

-- 1. 检查 user-avatars 存储桶是否存在
SELECT 
    id, 
    name, 
    public,
    created_at
FROM storage.buckets 
WHERE id = 'user-avatars';

-- 2. 检查存储桶的 RLS 策略
SELECT 
    policyname,
    permissive,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects' 
  AND policyname LIKE '%avatar%';

-- 3. 检查当前用户的认证状态
SELECT 
    auth.uid() as current_user_id,
    auth.role() as current_role;

-- 4. 检查已上传的头像文件（如果有）
SELECT 
    name,
    bucket_id,
    owner,
    created_at,
    metadata
FROM storage.objects 
WHERE bucket_id = 'user-avatars'
ORDER BY created_at DESC
LIMIT 10;

-- 5. 测试上传权限（检查策略是否生效）
-- 这个查询会显示当前用户是否有权限插入对象
SELECT 
    has_table_privilege('storage.objects', 'INSERT') as can_insert,
    has_table_privilege('storage.objects', 'SELECT') as can_select,
    has_table_privilege('storage.objects', 'UPDATE') as can_update,
    has_table_privilege('storage.objects', 'DELETE') as can_delete;
