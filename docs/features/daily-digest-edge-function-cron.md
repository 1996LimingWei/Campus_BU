# Daily Digest 服务端定时推送设置教程

本文说明如何把 AI Daily Digest 从客户端触发改成服务端定时触发。目标是：即使用户没有打开 App，服务端也能每天 10:45 检查是否有新的 Daily Digest；有新内容才推送，没有新内容不推送。

## 1. 确认目标行为

最终行为应该是：

- 每天香港/上海时间 10:45 自动运行一次服务端任务。
- 服务端拉取当天 Daily Digest 内容。
- 如果没有解析到新的 digest items，不推送。
- 如果有新内容，只给开启 Daily Digest 的用户推送。
- 同一用户同一天只推送一次。
- App 内通知列表不展示 Daily Digest 内容，用户点系统推送后进入 Agent 查看完整摘要。

## 2. 建 Daily Digest 偏好表

Edge Function 在服务端运行，不能读取用户手机上的本地 storage。因此需要把用户是否开启 Daily Digest 同步到 Supabase。

在 Supabase SQL Editor 执行：

```sql
create table if not exists public.user_daily_digest_preferences (
  user_id uuid primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
```

如果 `auth.users.id` 是 UUID，可以继续加外键：

```sql
alter table public.user_daily_digest_preferences
  add constraint user_daily_digest_preferences_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;
```

## 3. 建推送发送记录表

这张表用于防止重复推送。

```sql
create table if not exists public.daily_digest_push_runs (
  user_id uuid not null,
  digest_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, digest_date)
);
```

可选外键：

```sql
alter table public.daily_digest_push_runs
  add constraint daily_digest_push_runs_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;
```

## 4. 让 App 开关同步到 Supabase

当前 App 的 Daily Digest 开关需要同时写本地 storage 和服务端表。

目标逻辑：

```ts
await storage.setItem(getDigestEnabledKey(userId), enabled ? 'true' : 'false');

await supabase
  .from('user_daily_digest_preferences')
  .upsert({
    user_id: userId,
    enabled,
    updated_at: new Date().toISOString(),
  });
```

读取开关时建议优先读服务端，失败时再回退到本地 storage。

## 5. 新建 Edge Function

在项目根目录执行：

```bash
supabase functions new daily_digest_cron
```

生成文件：

```text
supabase/functions/daily_digest_cron/index.ts
```

## 6. Edge Function 的核心逻辑

`daily_digest_cron` 应该按这个顺序执行：

1. 计算今天的 digest date。
2. 拉取 Daily Digest 来源页面。
3. 解析 digest items 和 summary。
4. 如果 `items.length === 0`，直接返回，不创建通知，不推送。
5. 查询 `user_daily_digest_preferences` 中 `enabled = true` 的用户。
6. 查询 `daily_digest_push_runs`，过滤掉今天已经发过的用户。
7. 查询剩余用户的 `user_push_tokens`。
8. 调 Expo Push API 发送系统推送。
9. 推送成功后写入 `daily_digest_push_runs`。

推送内容建议保持简短，不包含完整摘要：

```ts
{
  title: `AI news digest ${digestDate}`,
  body: "Open Agent to read today's AI news digest.",
  data: {
    type: 'system',
    relatedId: `daily_digest:${digestDate}`,
  },
}
```

完整 Daily Digest 内容仍然由 Agent 页面按日期拉取展示。

## 7. 设置 Supabase Secrets

部署前设置服务端环境变量：

```bash
supabase secrets set SUPABASE_URL="你的 Supabase URL"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="你的 service role key"
```

不要把 service role key 写进代码或提交到仓库。

## 8. 本地测试 Edge Function

启动本地函数：

```bash
supabase functions serve daily_digest_cron
```

另开一个终端调用：

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/daily_digest_cron
```

检查：

- 没有新内容时返回 no new content。
- 有新内容时能查到目标用户和 push token。
- 同一天重复调用不会重复推送。

## 9. 部署 Edge Function

```bash
supabase functions deploy daily_digest_cron
```

部署后可直接调用线上函数测试：

```bash
curl -X POST https://你的项目ref.supabase.co/functions/v1/daily_digest_cron \
  -H "Authorization: Bearer 你的 service role key"
```

## 10. 创建 Supabase Cron Job

香港/上海时间是 UTC+8。每天 10:45 对应 UTC 02:45，所以 cron 表达式是：

```text
45 2 * * *
```

推荐用 Supabase Dashboard：

```text
Integrations -> Cron -> Create job
```

配置：

```text
Name: daily-digest-1045-hkt
Schedule: 45 2 * * *
Target: Supabase Edge Function
Function: daily_digest_cron
Method: POST
```

如果用 SQL 创建，需要启用 `pg_net`，并用 `net.http_post` 调用 Edge Function：

```sql
create extension if not exists pg_net;

select cron.schedule(
  'daily-digest-1045-hkt',
  '45 2 * * *',
  $$
  select net.http_post(
    url := 'https://你的项目ref.supabase.co/functions/v1/daily_digest_cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer 你的 service role key'
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 10000
  );
  $$
);
```

如果使用 SQL 方式，不建议把 service role key 明文写进迁移文件。优先使用 Dashboard，或通过 Supabase Vault/受控环境变量处理密钥。

## 11. 上线后检查

上线后按顺序检查：

1. Supabase Edge Function logs 是否在每天 UTC 02:45 运行。
2. 没有新内容时是否没有写入 `daily_digest_push_runs`。
3. 有新内容时是否写入 `daily_digest_push_runs`。
4. `user_push_tokens` 中的设备是否收到 Expo push。
5. 点推送是否进入 Agent。
6. App 内通知上拉栏是否不显示 Daily Digest 内容。

## 12. 回滚方式

如果服务端推送异常：

1. 在 Supabase Dashboard 暂停 `daily-digest-1045-hkt` Cron Job。
2. 保留 Edge Function，不需要立刻删除。
3. 检查 Function logs 和 `daily_digest_push_runs`。
4. 修复后手动触发一次，再重新启用 Cron Job。
