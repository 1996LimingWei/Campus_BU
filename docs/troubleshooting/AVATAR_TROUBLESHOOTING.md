# 头像上传故障排查指南

## 问题：头像没有上传到数据库存储桶

### 快速诊断步骤

#### 步骤 1: 运行诊断脚本

在 Supabase Dashboard → SQL Editor 中运行：
```
scripts/database/check_avatar_storage.sql
```

这个脚本会检查：
- ✅ `user-avatars` 存储桶是否存在
- ✅ RLS 策略是否正确配置
- ✅ 当前用户的认证状态
- ✅ 已上传的文件列表
- ✅ 权限设置

---

#### 步骤 2: 查看诊断结果

根据诊断脚本的结果判断问题：

**情况 A: 存储桶不存在**
```
结果: 0 rows (存储桶查询返回空)
```
→ 跳到 [解决方案 A](#解决方案-a-创建存储桶)

**情况 B: RLS 策略缺失**
```
结果: 找到的策略数量 < 4
```
→ 跳到 [解决方案 B](#解决方案-b-修复-rls-策略)

**情况 C: 用户未认证**
```
current_user_id: null
current_role: anon
```
→ 跳到 [解决方案 C](#解决方案-c-用户认证问题)

**情况 D: 权限问题**
```
can_insert: false
```
→ 跳到 [解决方案 D](#解决方案-d-权限问题)

---

### 解决方案

#### 解决方案 A: 创建存储桶

**方法 1: 运行初始化脚本**
在 Supabase SQL Editor 中运行：
```
scripts/database/setup_user_avatars_storage.sql
```

**方法 2: 使用修复脚本**
在 Supabase SQL Editor 中运行：
```
scripts/database/fix_avatar_storage.sql
```

**方法 3: 手动创建（通过 UI）**
1. 打开 Supabase Dashboard
2. 进入 Storage 页面
3. 点击 "New bucket"
4. 名称: `user-avatars`
5. 设置为 Public bucket: ✓
6. 点击 "Create bucket"

---

#### 解决方案 B: 修复 RLS 策略

运行修复脚本：
```sql
-- 在 Supabase SQL Editor 中运行
scripts/database/fix_avatar_storage.sql
```

这个脚本会：
1. 删除旧的冲突策略
2. 重新创建 4 个正确的策略：
   - `Users can upload own avatar` (INSERT)
   - `Users can update own avatar` (UPDATE)
   - `Anyone can read avatars` (SELECT)
   - `Users can delete own avatar` (DELETE)

---

#### 解决方案 C: 用户认证问题

**问题**: 用户未正确登录

**检查步骤**:
1. 确认应用中已经登录
2. 检查 Supabase 配置是否正确:
   ```typescript
   // 检查 services/supabase.ts
   const IS_PROD = true; // 确认环境设置正确
   ```

3. 验证认证 token:
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   console.log('Session:', session);
   ```

**解决方法**:
- 退出登录后重新登录
- 清除应用缓存
- 检查 `.env` 文件中的 Supabase 配置

---

#### 解决方案 D: 权限问题

**常见原因**:
1. RLS 策略配置错误
2. 文件路径不符合策略要求
3. 存储桶设置为非公开

**检查文件路径格式**:
```typescript
// 正确格式: {userId}/avatar_{timestamp}.jpg
// 例如: 550e8400-e29b-41d4-a716-446655440000/avatar_1234567890.jpg

const fileName = `${userId}/avatar_${Date.now()}.jpg`;
```

**检查策略要求**:
```sql
-- 策略要求文件必须上传到以用户 ID 命名的文件夹
(storage.foldername(name))[1] = auth.uid()::text
```

**修复步骤**:
1. 运行 `fix_avatar_storage.sql`
2. 确保上传时使用正确的文件路径格式
3. 确认用户已正确认证

---

### 完整测试流程

#### 使用测试脚本

运行测试脚本验证配置：
```bash
# 如果使用 tsx
npx tsx scripts/test_avatar_storage.ts

# 或者使用 ts-node
npx ts-node scripts/test_avatar_storage.ts
```

测试脚本会自动检查：
- ✅ 用户认证状态
- ✅ 存储桶是否存在
- ✅ 上传权限
- ✅ 读取权限
- ✅ 删除权限
- ✅ 用户表配置

---

### 常见错误信息及解决方法

#### 错误 1: "new row violates row-level security policy"
**原因**: RLS 策略阻止了操作
**解决**: 运行 `fix_avatar_storage.sql`

#### 错误 2: "Bucket not found"
**原因**: `user-avatars` 存储桶不存在
**解决**: 运行 `setup_user_avatars_storage.sql`

#### 错误 3: "The resource already exists"
**原因**: 上传时使用了相同的文件名
**解决**: 代码中已经使用 `upsert: true`，应该不会出现此错误

#### 错误 4: "Network request failed"
**原因**: 
- 网络连接问题
- Supabase URL 配置错误
- 文件读取失败

**解决**:
1. 检查网络连接
2. 验证 `services/supabase.ts` 中的配置
3. 检查图片文件是否存在且可读

#### 错误 5: "Failed to upload avatar"
**原因**: 可能是文件格式或大小问题
**解决**:
1. 检查文件大小 (限制: 5MB)
2. 检查文件格式 (支持: jpg, jpeg, png, webp)
3. 查看浏览器控制台获取详细错误信息

---

### 验证修复

完成修复后，按以下步骤验证：

1. **在 SQL Editor 中验证**:
   ```sql
   -- 检查存储桶
   SELECT * FROM storage.buckets WHERE id = 'user-avatars';
   
   -- 检查策略（应该返回 4 条）
   SELECT policyname FROM pg_policies 
   WHERE tablename = 'objects' 
   AND policyname LIKE '%avatar%';
   ```

2. **在应用中测试**:
   - 登录应用
   - 进入个人资料页面
   - 点击头像选择图片
   - 确认上传成功
   - 检查头像是否显示

3. **在 Supabase 中验证**:
   - 打开 Storage → user-avatars
   - 应该能看到上传的文件
   - 文件应该在以用户 ID 命名的文件夹中

---

### 预防措施

为避免将来出现问题：

1. **使用数据库迁移脚本**:
   - 将所有 SQL 脚本保存在 `scripts/database/` 目录
   - 新数据库部署时按顺序运行所有脚本

2. **文档化部署步骤**:
   - 记录所有必需的初始化脚本
   - 创建部署检查清单

3. **自动化测试**:
   - 在 CI/CD 中运行测试脚本
   - 定期验证存储桶配置

---

### 需要更多帮助？

如果以上步骤都无法解决问题：

1. 检查浏览器控制台的完整错误信息
2. 查看 Supabase Dashboard → Logs
3. 运行测试脚本并提供完整输出
4. 检查 `services/auth.ts` 中的 `uploadUserAvatar` 函数

---

### 相关文件

- **初始化脚本**: `scripts/database/setup_user_avatars_storage.sql`
- **诊断脚本**: `scripts/database/check_avatar_storage.sql`
- **修复脚本**: `scripts/database/fix_avatar_storage.sql`
- **测试脚本**: `scripts/test_avatar_storage.ts`
- **上传函数**: `services/auth.ts` (uploadUserAvatar, uploadAndUpdateAvatar)
- **UI 组件**: `app/(tabs)/profile.tsx`
