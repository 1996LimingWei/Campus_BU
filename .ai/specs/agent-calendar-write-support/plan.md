# 当前实现现状

- `services/agent/tools.ts` 只有 `read_user_schedule`，没有任何写课表/写日历工具。
- `services/agent/executor.ts` 已经有一套成熟的“待确认写操作”模式，但当前只覆盖课程评价、课程聊天、组队帖、memory 写入。
- `services/schedule.ts` 已经支持：
  - OCR 导课落到 `user_schedule_entries`
  - 手动新增课程课表
  - 更新 / 删除课程课表
- `components/profile/MyScheduleCard.tsx` 已经是用户查看与编辑课表的集中入口，但它只理解“按星期重复的课程”，没有“一次性考试/日历事件”的读写界面。
- `services/widgetBridge.ts` 只同步课程课表到 iOS widget，结构也只支持重复课程。

# 问题定位

问题不在“缺少一个 agent 工具”这么简单，而在于当前时间模型只有“重复课表”，没有“单次事件”。

如果只给 agent 加一个“写课表”工具：

- 课程能写进去；
- 但考试没有合理的数据结构承载；
- 如果把考试伪装成普通课表，会出现日期表达不准确、按星期查询失真、编辑/去重逻辑错误等问题。

所以根因是：

1. agent 缺少写时间数据的工具与确认流。
2. 底层缺少一次性日历事件模型。
3. UI 缺少对一次性事件的最小展示入口。

# 最小可行方案

推荐方案：保留现有 `user_schedule_entries` 作为“重复课程课表”，新增 `user_calendar_events` 作为“一次性日历事件”，由 agent 分流写入。

具体做法：

1. 新增 `user_calendar_events` 表与对应服务模块，承载考试、quiz、midterm、final、presentation 等单次事件。
2. agent 增加两个写能力：
   - `write_user_schedule_entry`：写重复课程课表。
   - `create_user_calendar_event`：写一次性考试/事件。
3. 在 `executor` 中新增时间写入意图识别与 pending action：
   - 当用户说“帮我把 COMP3015 每周二 9:00 写进日历”时，走课程课表写入。
   - 当用户说“我 5 月 12 号有 COMP3015 final，帮我记一下”时，走考试事件写入。
4. 两类写入都必须先补齐必要字段，再向用户展示确认文案，用户确认后才调用服务写入。
5. `MyScheduleCard` 做最小展示增强：
   - 保留现有按周课表展示不变；
   - 追加一个“即将到来的日程/考试”小节，展示未来若干天的一次性事件。

# 备选方案

## 方案 A：扩展 `user_schedule_entries`，同时容纳课程和考试

做法：
- 给 `user_schedule_entries` 增加 `entry_type`、`specific_date` 等字段，让它同时承载重复课和一次性考试。

不选原因：
- 现有查询、排序、OCR 导课、编辑逻辑都假设它是按周重复结构。
- 会让“day_of_week + week_text”和“specific_date”长期并存，边界容易混乱。
- 改动面比新建事件表更大，回归风险更高。

## 方案 B：直接接手机系统日历

做法：
- 通过 Expo 或原生能力直接写入 iOS/Android 系统 Calendar。

不选原因：
- 权限、平台差异、重复写入、更新删除映射都会明显扩大范围。
- 当前项目没有现成系统日历集成基础，不符合最小改动目标。

# 为什么选择当前方案

推荐方案把“重复课程”和“一次性考试”拆开，和当前业务语义最一致：

- 课程写入最大化复用现有 `schedule.ts`。
- 考试事件最小增量建模，不污染原有课表结构。
- agent 层只是在已有 pending write 模式上新增一种时间写入分支，心智模型统一。
- UI 只做小幅增强，不需要新页面，也不影响现有 OCR 导课链路。

这是当前代码基础上风险最低、最容易验证、最容易回滚的方案。

# 风险与影响面

- 数据层风险：新增 `user_calendar_events` 后，需要明确去重规则与编辑删除策略，否则 agent 重复记考试时会出现重复项。
- agent 风险：时间解析不完整时，可能误把“复习安排”写成“考试事件”；需要通过明确 intent 词和确认文案降低误写。
- UI 风险：`MyScheduleCard` 当前以“按星期看课”为主，加入一次性事件后要避免信息拥挤。
- 兼容性风险：`user_schedule_entries`、OCR 导课、widget 同步都必须保持原逻辑不变。
- 回滚难度：中低。新增事件表和新增 agent 工具都可局部回退，不需要回滚现有课表结构。
