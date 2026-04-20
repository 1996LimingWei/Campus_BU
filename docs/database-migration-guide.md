# 数据库结构修改指南

本文档适用于 Campus_BU（HKCampus）项目，指导开发者在只有一个 Supabase 项目（PROD）的情况下，安全地修改数据库结构。

---

## 当前架构

- 只保留一个 Supabase 远端项目（PROD），不额外维护 DEV 实例
- 所有 migration 文件存放在 `supabase/migrations/` 目录，按时间戳命名
- 前端通过 `services/supabase.ts` 直连 PROD

## 修改流程

### 第一步：编写 Migration 文件

在 `supabase/migrations/` 下新建 SQL 文件，命名格式：

```
YYYYMMDD_简要描述.sql
```

例如：`20260421_add_user_preferences.sql`

**必须使用防御性写法**，确保重复执行不会报错：

```sql
-- 加列
ALTER TABLE public.xxx ADD COLUMN IF NOT EXISTS new_col TEXT DEFAULT '';

-- 建索引
CREATE INDEX IF NOT EXISTS xxx_new_col_idx ON public.xxx (new_col);

-- 函数
CREATE OR REPLACE FUNCTION public.xxx_func() ...;

-- 策略（先 DROP 再 CREATE）
DROP POLICY IF EXISTS "policy_name" ON public.xxx;
CREATE POLICY "policy_name" ON public.xxx ...;
```

### 第二步：在 SQL Editor 中验证

在 Supabase 的 SQL Editor 中用事务包裹，验证后 ROLLBACK：

```sql
BEGIN;

-- 粘贴 migration 内容
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS new_col TEXT;

-- 验证
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'forum_posts' AND column_name = 'new_col';

ROLLBACK;  -- 确认无误后改为 COMMIT
```

`ROLLBACK` 会撤销所有改动，相当于免费的沙盒测试。

### 第三步：正式执行

确认无误后，重新执行并 `COMMIT`：

```sql
BEGIN;
-- migration 内容
COMMIT;
```

### 第四步：更新前端代码

修改对应的 TypeScript 类型（`types/index.ts`）和 service 层代码，适配新的数据库结构。

### 第五步：提交代码并打包

```bash
git add supabase/migrations/xxx.sql types/index.ts services/xxx.ts
git commit -m "feat(db): 添加 xxx 功能的数据库支持"
eas build --platform all --profile production
eas submit
```

---

## 安全改动 vs 危险改动

### 安全（向后兼容，旧 app 不受影响）

| 操作 | 说明 |
|---|---|
| `ADD COLUMN`（带 DEFAULT） | 旧代码不认识新列，自动忽略 |
| `CREATE INDEX` | 不影响查询结果 |
| `CREATE TABLE` | 旧代码不查新表 |
| `CREATE FUNCTION / VIEW` | 旧代码不调用就不影响 |
| 新增 RLS Policy | 放宽权限不影响已有操作 |

### 危险（破坏向后兼容，旧 app 可能崩溃）

| 操作 | 后果 |
|---|---|
| `DROP COLUMN` | 旧代码 SELECT 该列会报错 |
| `RENAME COLUMN` | 等同 DROP + ADD，旧代码找不到原列名 |
| `ALTER COLUMN TYPE` | 可能导致类型不兼容 |
| `DROP POLICY` / 修改 RLS | 旧代码的写入/读取可能被拒 |
| `DROP FUNCTION` | 旧代码调用会 500 |

---

## 危险改动的处理方式

### 当前阶段（未宣发，用户极少）

直接改，不需要分步。趁没用户把结构定稳。

### 宣发后（有真实用户）

采用**两阶段发版**策略：

**阶段 1：发新版 app（代码先兼容）**
- 新代码不再读写即将删除的列/函数
- 上架新版并触发强制更新

**阶段 2：执行数据库变更**
- 确认所有用户已更新到新版
- 执行 DROP COLUMN / DROP FUNCTION 等危险操作

### 强制更新机制（建议宣发后实现）

在数据库中维护一个最低版本号：

```sql
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO public.app_config (key, value)
VALUES ('min_app_version', '1.2.1')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

App 启动时查询该值，低于最低版本则弹出强制更新提示。

---

## Migration 文件编写规范

1. **一个文件对应一个功能变更**，不要把不相关的改动混在一起
2. **文件头写注释**，说明本次变更的目的、影响范围、是否需要配合前端改动
3. **所有 DDL 必须幂等**（`IF NOT EXISTS`、`CREATE OR REPLACE`、先 DROP 再 CREATE）
4. **RPC 函数用 `SECURITY DEFINER`** 并收紧 `GRANT`，不要把权限给 `PUBLIC`
5. **测试时先 ROLLBACK**，确认无误再 COMMIT

---

## 验证清单

每次 migration 执行后，跑以下检查：

```sql
-- 确认表结构
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '目标表名'
ORDER BY ordinal_position;

-- 确认 RLS 策略
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = '目标表名';

-- 确认函数存在
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE '%关键词%';

-- 确认索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = '目标表名';
```

---

## 现有 Migration 清单

| 文件 | 功能 |
|---|---|
| `20260218_agent_memory.sql` | AI Agent 记忆系统 |
| `20260226_favorites.sql` | 收藏功能 |
| `20260228_post_comment_threading.sql` | 评论嵌套回复 |
| `20260304_forum.sql` | 论坛核心表（帖子、评论、点赞） |
| `20260305_fix_rls.sql` | RLS 策略修补 |
| `20260305_knowledge_base.sql` | Agent 知识库（pgvector） |
| `20260305_teaming_rls_delete_update.sql` | 组队 RLS 策略 |
| `20260306_add_reply_support.sql` | 回复支持 |
| `20260312_add_admin_system.sql` | 管理员系统（is_user_admin） |
| `20260313_add_admin_deletion_policies.sql` | 管理员删除权限 |
| `20260313_user_follows.sql` | 用户关注 |
| `20260317_direct_messages.sql` | 私信系统 |
| `20260325_agent_kb_rpc_hardening.sql` | 知识库 RPC 安全加固 |
| `20260410_moderation_admin_notifications.sql` | 审核通知 |
| `20260410_moderation_compliance.sql` | UGC 合规系统 |
| `20260410_moderation_enforcement_actions.sql` | 处罚执行 |
| `20260413_fix_reports_target_type_check.sql` | 举报类型校验修复 |
| `20260419_add_user_calendar_events.sql` | 用户日历事件 |
| `20260420_forum_editorial_support.sql` | 论坛编辑部攻略支持 |

---

## 附加 SQL 文件（非 migration，需手动执行）

| 文件 | 说明 |
|---|---|
| `supabase/admin_management_helpers.sql` | 管理员管理辅助函数 |
| `supabase/setup_delete_account.sql` | 账户删除功能 |
| `supabase/setup_push_tokens.sql` | 推送令牌表 |
| `supabase/setup_push_triggers.sql` | 推送触发器 |
| `supabase/fix_push_tokens_rls.sql` | 推送令牌 RLS 修复 |
