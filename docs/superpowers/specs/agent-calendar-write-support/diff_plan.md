# 需要修改的文件

- 新建：`supabase/migrations/<timestamp>_add_user_calendar_events.sql`
- 新建：`services/calendar.ts`
- 修改：`services/agent/tools.ts`
- 修改：`services/agent/executor.ts`
- 视实现需要修改：`services/agent/types.ts`
- 修改：`components/profile/MyScheduleCard.tsx`
- 新建：`__tests__/services/calendar.test.ts`
- 修改：`__tests__/services/agent/executor.test.ts`
- 视 UI 拆分情况新建：`__tests__/components/profile/MyScheduleCard.test.tsx`

# 逐文件改动计划

## supabase/migrations/<timestamp>_add_user_calendar_events.sql
### 修改目的

为一次性考试/日历事件提供独立持久化表。

### 具体改动点

- 新增 `user_calendar_events` 表。
- 字段至少包含：
  - `id`
  - `user_id`
  - `title`
  - `event_type`，如 `exam | quiz | assignment | custom`
  - `course_code`
  - `matched_course_id`
  - `event_date`
  - `start_time`
  - `end_time`
  - `location`
  - `note`
  - `is_active`
  - `created_at`
  - `updated_at`
- 建立按用户 + 日期查询的索引。
- 建立基础去重约束或唯一索引，避免同一用户反复创建完全相同的考试事件。
- 配置与现有用户数据表一致的 RLS 策略。

### 兼容性要求

- 不修改现有 `user_schedule_entries` 表结构。
- 不影响现有 OCR 导课和课表读写。

## services/calendar.ts
### 修改目的

提供一次性日历事件的服务层封装，隔离 agent 和 UI 对数据库细节的依赖。

### 具体改动点

- 定义 `UserCalendarEvent` 类型与 mapper。
- 新增以下函数：
  - `getUpcomingUserCalendarEvents(userId, options?)`
  - `createUserCalendarEvent(input)`
  - `updateUserCalendarEvent(input)` 如果本期 UI 需要编辑
  - `deleteUserCalendarEvent(input)` 如果本期 UI 需要删除
- 在 `createUserCalendarEvent` 中做最小字段校验与去重处理。
- 课程写入逻辑不迁移到这里，仍留在 `services/schedule.ts`。

### 兼容性要求

- 与 `services/schedule.ts` 并行存在，不相互覆盖职责。

## services/agent/tools.ts
### 修改目的

把 agent 的“时间写入”能力显式暴露为工具定义。

### 具体改动点

- 保留 `read_user_schedule` 不变。
- 新增 `write_user_schedule_entry` 工具定义。
- 新增 `create_user_calendar_event` 工具定义。
- 参数描述中明确必填字段与使用场景：
  - 课程：标题、星期、时间或周次表达、课室、课程代码可选。
  - 考试：标题、日期必填，时间/地点/课程代码可选但建议提供。

### 兼容性要求

- 不修改现有其它工具签名。

## services/agent/executor.ts
### 修改目的

让 agent 能识别“帮我记课/记考试”，并在确认后执行写入。

### 具体改动点

- 新增时间写入意图识别：
  - 课程写入意图
  - 考试/事件写入意图
- 新增 pending action 类型，沿用现有 course publish / memory write 的确认模式。
- 新增缺失字段补问逻辑。
- 新增确认文案生成：
  - 课程写入确认文案
  - 考试事件确认文案
- 在确认后调用：
  - `createManualScheduleEntry(...)` 或一个轻量 schedule 写入 helper
  - `createUserCalendarEvent(...)`
- 让 agent 在写入成功后返回可复述的结果摘要。
- 让 agent 在后续 schedule 查询中继续沿用原能力；是否把事件查询并入 `read_user_schedule`，本期可选但要在实现前明确。

### 兼容性要求

- 不破坏现有课程评价、组队、聊天、memory 流程。
- 不绕过确认直接写入。

## services/agent/types.ts
### 修改目的

如果 `executor.ts` 的新增 pending action 或 step 结构需要共享类型，则在这里补充。

### 具体改动点

- 仅在确实需要跨文件共享类型时新增：
  - 时间写入 pending action 类型
  - calendar event 基础输入类型

### 兼容性要求

- 若无共享必要，则保持无变化。

## components/profile/MyScheduleCard.tsx
### 修改目的

给用户一个基础可见入口，查看 agent 记下的一次性考试/事件。

### 具体改动点

- 保留当前按星期展示的课程课表不变。
- 增加一个“即将到来的日程 / 考试”区块。
- 该区块从 `services/calendar.ts` 读取未来 N 天事件。
- 首期只要求展示标题、日期、时间、地点，不强制要求完整编辑器。
- 如果实现成本低，可补充删除入口；否则先只读展示。

### 兼容性要求

- 不重构现有 OCR 导课 modal。
- 不改动当前课程课表主流程。

## __tests__/services/calendar.test.ts
### 修改目的

验证一次性日历事件服务的核心行为。

### 具体改动点

- 覆盖创建成功。
- 覆盖缺少日期时失败。
- 覆盖重复事件防重。
- 覆盖 upcoming 查询排序。

### 兼容性要求

- 使用现有 Supabase mock 风格，不引入新的测试基础设施。

## __tests__/services/agent/executor.test.ts
### 修改目的

验证 agent 的时间写入意图、补问、确认和执行路径。

### 具体改动点

- 新增“帮我把 COMP3015 周二 9 点记进日历”测试。
- 新增“我 5 月 12 号有 final，帮我记一下”测试。
- 新增缺字段时 agent 继续追问测试。
- 新增用户确认后才真正写入测试。
- 新增取消/不确认时不写入测试。

### 兼容性要求

- 不修改现有已通过的 schedule read 测试语义。

## __tests__/components/profile/MyScheduleCard.test.tsx
### 修改目的

如果 UI 区块单独渲染逻辑足够多，则补一个组件层回归测试。

### 具体改动点

- 覆盖 upcoming 事件可见。
- 覆盖无事件时区块不出现或显示空态。

### 兼容性要求

- 若首期 UI 改动很小，也可以不新增该测试文件，改为在已有组件测试内补用例。

# 禁止改动的文件

- `services/ai-ocr.ts`
- `services/courses.ts`
- `services/favorites.ts`
- `services/teaming.ts`
- `components/agent/AgentChatScreen.tsx`
- 与本任务无关的 campus / forum / map / direct messages 相关文件

# 必须保持兼容的逻辑

- 现有 `read_user_schedule` 查询行为保持可用。
- OCR 导课、手动导课、编辑课表、删除课表行为保持原语义。
- iOS widget 继续只同步课程课表；本期不要求同步一次性考试事件。
- agent 现有课程社区、memory、FAQ 路由不受影响。

# 数据结构 / 接口 / 状态流变化

- `user_schedule_entries`：无变化。
- 新增 `user_calendar_events`：新增。
- agent 工具集合：新增 2 个写工具定义。
- agent pending write 状态流：新增“时间写入”分支。
- 个人课表 UI 状态流：新增“读取 upcoming 事件”状态，但原课表状态流不变。
