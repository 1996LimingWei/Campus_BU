# Daily Digest TODO

## 模块进度

已完成（2026-03-26）：

- 已新增 `services/agent/dailyDigest/` 专属目录与核心文件
- 已实现资讯页面抓取、链接解析、摘要生成、消息拼装
- 已实现按用户按日期缓存，避免同日重复生成
- 已实现通过 `notifications` 表发送 `system` 类型通知，复用现有 push 链路
- 已在 Agent 对话页自动注入当日摘要消息
- 已在 Agent 对话消息内支持 `http/https` 链接点击打开
- 已在全局布局接入 push 点击后跳转 Agent 对话页

## 待完成

- 服务端定时任务（当前为用户打开 Agent 页触发）
- 解析规则进一步增强（适配来源页面结构变化）

## 最近完成

- push 标题已携带 digest 日期（`YYYY-MM-DD`）
- push 点击后会跳转 Agent 并传入 `digestDate` 参数
- Agent 页面会优先加载 `digestDate` 对应日报消息
