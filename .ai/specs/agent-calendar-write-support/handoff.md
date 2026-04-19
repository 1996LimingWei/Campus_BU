# 给实现代理的任务说明

实现“agent 帮用户写课程到课表，并把考试写入一次性日历事件”的最小可行版本。不要把本任务扩展成系统日历同步，也不要重构现有 OCR 导课和课表结构。

# 实现顺序

1. 新增一次性事件的数据表与 RLS。
2. 新建 `services/calendar.ts`，封装一次性事件读写。
3. 在 `services/agent/tools.ts` 增加课程写入与考试事件写入工具定义。
4. 在 `services/agent/executor.ts` 增加时间写入意图识别、补问、确认和执行逻辑。
5. 在 `components/profile/MyScheduleCard.tsx` 增加 upcoming 事件只读展示。
6. 补齐服务层与 agent 层测试。
7. 跑聚焦测试，确认没有破坏原有课表读取与编辑逻辑。

# 每一步完成标志

1. migration 已存在，`user_calendar_events` 表结构、索引、RLS 完整。
2. `services/calendar.ts` 已能独立创建、查询、去重一次性事件。
3. agent 工具定义中已出现新的时间写入工具，参数说明完整。
4. agent 在“课程写入”和“考试写入”两类场景下都能先确认后执行，且缺字段时会追问。
5. 个人课表区域能展示 upcoming 事件，原课程课表 UI 不受影响。
6. 新增测试已覆盖关键主路径与失败路径。
7. 聚焦测试通过，手工验证步骤至少完成核心 2 条写入链路。

# 必跑命令

- `npx jest __tests__/services/calendar.test.ts --runInBand`
- `npx jest __tests__/services/agent/executor.test.ts --runInBand`
- 如果改了 `MyScheduleCard` 并新增组件测试：
  - `npx jest __tests__/components/profile/MyScheduleCard.test.tsx --runInBand`

# 必做验证

- 手工验证课程写入流程一次。
- 手工验证考试事件写入流程一次。
- 手工验证缺字段补问一次。
- 手工验证“今天有什么课”读课表流程仍然正常。

# 不允许做的事

- 不把考试事件塞进 `user_schedule_entries`。
- 不引入 Apple / Google 系统日历同步。
- 不重构 OCR 导课链路。
- 不顺手重写 `MyScheduleCard` 整体结构。
- 不修改与本任务无关的 course community、forum、campus、map 等模块。
- 不跳过确认直接写入用户数据。

# 遇到不确定时的决策原则

- 优先选择最小偏离现有结构的方案。
- 能复用 `schedule.ts` 的课程写入逻辑就复用，不重复造轮子。
- 一次性事件与重复课程必须分开建模。
- 如果自然语言时间解析范围不明确，首期宁可要求用户补充明确日期，也不要做高风险的模糊解析。
- 如果 UI 展示范围拿不准，先做只读 upcoming 区块，不做复杂编辑器。

# 最终交付物清单

- `supabase/migrations/<timestamp>_add_user_calendar_events.sql`
- `services/calendar.ts`
- 修改后的 `services/agent/tools.ts`
- 修改后的 `services/agent/executor.ts`
- 可能修改的 `services/agent/types.ts`
- 修改后的 `components/profile/MyScheduleCard.tsx`
- `__tests__/services/calendar.test.ts`
- 修改后的 `__tests__/services/agent/executor.test.ts`
- 如需要的 `MyScheduleCard` 相关组件测试
