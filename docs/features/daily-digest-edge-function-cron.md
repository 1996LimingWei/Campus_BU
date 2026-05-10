# Daily Digest 服务端抓取入库与定时推送方案

本文档用于同步当前 Daily Digest 的目标逻辑。这个方案与 EAS OTA 无关，核心改动是把原本放在 App 端的抓取和解析流程，整体搬到 Supabase Edge Function。

最终目标是：

- 服务端定时从新的 Daily Digest 数据源拉取内容。
- 服务端把解析结果写入数据库。
- 服务端按用户偏好决定是否推送。
- Agent 页面只读取数据库中的 Daily Digest，不再直接抓取外部源站。

## 1. 背景

当前实现里，Daily Digest 仍然主要由客户端负责：

- App 端根据日期拼接源站 URL。
- App 端抓取 HTML 并解析摘要、条目和消息。
- App 端把 digest 缓存在本地 storage。
- App 端根据通知记录推断日期后再重新跑一次抓取逻辑。

这套实现存在几个问题：

- 更换数据源时需要依赖客户端发版或 OTA。
- 用户不打开 App 时，服务端无法独立完成 digest 生产。
- digest 内容只存在本地缓存，不利于统一读取和追踪。
- Agent 页面现在虽然“看起来像从数据库读”，本质上仍会回到客户端抓取逻辑。

因此需要把抓取、解析、入库、推送统一迁移到服务端。

## 2. 新的职责边界

迁移完成后，职责应该明确如下：

- Edge Function：负责抓取新数据源、解析、生成结构化 digest、写数据库。
- Cron Job：负责每天定时触发 Edge Function。
- 数据库：作为 Daily Digest 的唯一可信存储。
- App Profile 开关：负责把用户是否开启 digest 同步到 Supabase。
- Agent 页面：只根据日期读取数据库中的 digest 内容并展示。
- 通知系统：继续复用现有 `notifications` 表和推送触发链路。

一句话说就是：

> 服务端生产 digest，客户端只消费 digest。

## 3. 目标行为

最终行为应该是：

- 每天香港/上海时间 10:45 自动执行一次服务端任务。
- 服务端从新的数据源拉取当天 digest。
- 如果当天没有解析到有效内容，不写通知、不推送。
- 如果解析成功，则先把 digest 写入数据库。
- 只有开启了 Daily Digest 的用户会收到推送。
- 同一用户同一天只推送一次。
- 用户点击系统推送后进入 Agent 页面查看该日 digest。
- Agent 页面展示的内容只来自数据库，不再直接请求外部源站。

## 4. 建议数据表

### 4.1 Daily Digest 主表

新增一张专门的 digest 表，用于存每天的结构化结果。

```sql
create table if not exists public.daily_digests (
  digest_date date primary key,
  source_url text not null,
  summary text not null,
  message text not null,
  items jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

字段建议说明：

- `digest_date`: 该期 digest 对应日期。
- `source_url`: 实际抓取的源地址，便于排查。
- `summary`: 提炼后的摘要文本。
- `message`: 最终给 Agent 展示的完整消息文本。
- `items`: 结构化条目列表，建议直接存 JSON。
- `raw_payload`: 可选，保留原始解析结果，方便后续调试或重构。

如果希望按更新时间自动维护：

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_daily_digests_updated_at on public.daily_digests;

create trigger trg_daily_digests_updated_at
before update on public.daily_digests
for each row
execute function public.set_updated_at();
```

### 4.2 用户 Digest 偏好表

服务端不能读取用户手机本地 storage，所以需要单独存一份服务端偏好。

```sql
create table if not exists public.user_daily_digest_preferences (
  user_id uuid primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
```

可选外键：

```sql
alter table public.user_daily_digest_preferences
  add constraint user_daily_digest_preferences_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;
```

### 4.3 推送发送记录表

用于防止同一天重复推送。

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

## 5. App 端需要同步的唯一状态

客户端后续不再负责抓取 digest，但仍然要负责把用户开关同步到 Supabase。

推荐行为：

- 打开 Daily Digest 开关时：
  - 本地可继续保留一份缓存，兼容旧逻辑。
  - 同时 upsert 到 `user_daily_digest_preferences`。
- 读取开关时：
  - 优先读 Supabase。
  - 服务端失败时再回退到本地 storage。

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

## 6. Edge Function 设计

新建：

```bash
supabase functions new daily_digest_cron
```

生成文件：

```text
supabase/functions/daily_digest_cron/index.ts
```

### 6.1 核心流程

`daily_digest_cron` 应按这个顺序执行：

1. 计算当天的 `digest_date`。
2. 根据新数据源规则构造抓取地址。
3. 从新数据源拉取内容。
4. 解析出 `summary`、`message`、`items`。
5. 如果 `items.length === 0`，直接返回，不入库、不推送。
6. 把 digest upsert 到 `daily_digests`。
7. 查询 `user_daily_digest_preferences` 中 `enabled = true` 的用户。
8. 查询 `daily_digest_push_runs`，过滤掉当天已经推送过的用户。
9. 对剩余用户写入 `notifications` 记录。
10. 写入 `daily_digest_push_runs`。

### 6.2 为什么建议“写 notifications”而不是自己直连 Expo Push

你仓库里已经有一条现成链路：

- 写 `public.notifications`
- 数据库触发器触发 `send_push_notification`
- Edge Function 统一调用 Expo Push API

所以新的 `daily_digest_cron` 不需要自己重复实现一套发 push 的逻辑，直接复用现有通知链路更稳。

推荐写入内容：

```ts
{
  user_id: userId,
  type: 'system',
  title: `AI news digest ${digestDate}`,
  content: "Open Agent to read today's AI news digest.",
  related_id: `daily_digest:${digestDate}`,
}
```

## 7. Agent 页面读取规则

这是这次架构调整里最重要的约束：

> Agent 页面只读数据库里的 Daily Digest，不再调用客户端抓取逻辑。

也就是说，后续 Agent 页面应该：

1. 优先根据 `digestDate` 参数读取 `daily_digests`。
2. 如果没有指定日期，则读取最新一条 `daily_digests`。
3. 直接展示数据库中存下来的 `message`。
4. 不再调用 `runDailyDigestJobForUser(...)` 去重新抓取源站。

推荐读取方式：

```ts
const { data } = await supabase
  .from('daily_digests')
  .select('digest_date, message, summary, items')
  .eq('digest_date', targetDate)
  .maybeSingle();
```

如果要查最新一期：

```ts
const { data } = await supabase
  .from('daily_digests')
  .select('digest_date, message, summary, items')
  .order('digest_date', { ascending: false })
  .limit(1)
  .maybeSingle();
```

## 8. 迁移完成后的客户端变化

完成这次迁移后，客户端相关逻辑应逐步调整为：

- `services/agent/dailyDigest/config.ts`
  不再作为线上真实抓取入口，只保留兼容期用途或删除。
- `services/agent/dailyDigest/job.ts`
  不再承担生产环境抓取职责，可改成读库包装层，或仅留开发测试使用。
- `services/agent/dailyDigest/repository.ts`
  本地缓存逻辑可以弱化，不再作为主数据源。
- `components/agent/AgentChatScreen.tsx`
  只读 `daily_digests`，不再重新跑抓取。

## 9. Supabase Secrets

部署前设置服务端环境变量：

```bash
supabase secrets set SUPABASE_URL="你的 Supabase URL"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="你的 service role key"
```

如果新数据源需要额外鉴权，也应放入 secrets，不要硬编码到仓库。

## 10. 本地测试

启动本地函数：

```bash
supabase functions serve daily_digest_cron
```

本地调用：

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/daily_digest_cron
```

检查点：

- 能否从新的数据源成功拉取。
- 解析后 `items` 是否正确。
- `daily_digests` 是否成功 upsert。
- 没有新内容时是否不会写通知。
- 同一天重复触发是否不会重复推送。
- Agent 页面是否能只靠数据库读到对应 digest。

## 11. 部署与定时任务

部署：

```bash
supabase functions deploy daily_digest_cron
```

香港/上海时间 UTC+8，每天 10:45 对应 UTC 02:45：

```text
45 2 * * *
```

推荐在 Supabase Dashboard 配置 Cron：

```text
Integrations -> Cron -> Create job
```

建议配置：

```text
Name: daily-digest-1045-hkt
Schedule: 45 2 * * *
Target: Supabase Edge Function
Function: daily_digest_cron
Method: POST
```

## 12. 上线后验收

上线后按顺序检查：

1. `daily_digest_cron` 是否在每天 UTC 02:45 运行。
2. `daily_digests` 是否写入当天数据。
3. 没有新内容时是否没有写入 `notifications`。
4. 有新内容时是否只给开启 digest 的用户写入通知。
5. `daily_digest_push_runs` 是否正确防重。
6. 用户点击推送后是否能进入 Agent 查看对应日期 digest。
7. Agent 页面是否完全不依赖外部源站也能展示 digest。

## 13. 回滚方式

如果服务端抓取或推送异常：

1. 在 Supabase Dashboard 暂停 `daily-digest-1045-hkt`。
2. 保留 `daily_digest_cron` 与 `daily_digests` 表，不需要立刻删除。
3. 检查函数日志、`daily_digests`、`notifications`、`daily_digest_push_runs`。
4. 修复后手动触发一次，再重新启用 Cron。

## 14. 一句话版本

Daily Digest 之后的标准流程应该是：

**新数据源 -> Supabase Edge Function 抓取解析 -> 写入 `daily_digests` -> 按偏好写 `notifications` -> 推送 -> Agent 页面只读 `daily_digests`。**
