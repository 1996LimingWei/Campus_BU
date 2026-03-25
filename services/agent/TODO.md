# Agent 后续优化 TODO

## 说明

六个阶段的一版实现已经完成。当前这个文件只保留后续真实优化项，不再重复记录已完成阶段。

完整完成总结见：

- [`services/agent/IMPLEMENTATION_SUMMARY.md`](/Campus_BU/services/agent/IMPLEMENTATION_SUMMARY.md)

---

## 已修复

### 1. 长对话压缩后的课程上下文回退

- 已让课程解析优先读取 `sessionState.referencedCourse`
- 已补回归测试，覆盖压缩历史后的课程解析

### 2. FAQ 弱相关本地结果误导结论

- 已在答案构造层重新比较 FAQ 分数与 KB 分数
- 本地 FAQ 置信度不足时，允许知识库结果优先作为结论
- 已补 FAQ 回归测试

### 3. 稳定子任务对复合意图的短路

- 已避免 memory 读写在明显复合意图下直接短路
- 当前策略是先不截断，让后续本地路由 / 模型路由继续处理
- 已补复合意图回归测试

### 4. Node 流式响应尾段 buffer 丢失

- 已在 fetch streaming 结束后补处理残留 buffer
- 已补 Node 路径单测

### 5. 低风险回复缓存 key 未绑定真实模型名

- 已改为使用真实 `FAST_MODEL` 参与响应缓存 key 生成

### 6. 检索、摘要与调试链路补齐

- 已新增 Supabase SQL 文件，补齐 `match_knowledge_base` 权限与 RPC 加固
- 已让 `services/faq.ts` 优先调用 pgvector RPC，再走轻量重排
- 已保留向量检索失败时的关键词回退路径
- 已把规则式摘要升级为“规则摘要保底 + fast model 结构化摘要”
- 已扩展稳定子任务到 FAQ query 规范化、写操作确认 / 取消识别
- 已让 CLI 显示命中路径、命中标记和当前模型配置
- 已补 FAQ / executor 对应回归测试

---

## 高优先级修复

当前高优先级问题已处理完成，后续优先进入检索、摘要质量和稳定子任务扩展。

---

## Daily Digest

迁移到专属目录维护：

- `services/agent/dailyDigest/TODO.md`

---

## 中优先级优化

### 7. 完善知识库导入链路

当前问题：

- 运行时检索已接入 pgvector RPC
- 但知识库导入脚本仍使用 `ANON KEY`
- 还未统一切到 `SERVICE_ROLE_KEY` 的安全导入方式

建议：

- 将 `scripts/ingest_faq.ts` 改为使用 `SUPABASE_SERVICE_ROLE_KEY`
- 明确区分“运行时读知识库”和“后台导入知识库”两类权限模型
- 视需要增加去重 / 重建索引 / 清库重灌脚本

涉及文件：

- `scripts/ingest_faq.ts`
- `.env.example`

### 8. 提升运行时 embedding 可用性

当前问题：

- 当前运行时 embedding 依赖 `@xenova/transformers`
- 在部分移动端 / 打包环境下未必稳定
- 当前策略是失败后回退关键词检索

建议：

- 评估是否迁移到后端 embedding proxy
- 或改为服务端生成 query embedding，前端只调 RPC
- 明确缓存策略，避免重复加载模型

涉及文件：

- `services/agent/embeddings.ts`
- `services/faq.ts`

### 9. 继续扩展稳定子任务覆盖面

可继续迁移的任务：

- 简单偏好抽取
- 更细粒度 FAQ 分类
- 更多 query 规范化模板
- 写操作草稿补全的纯规则抽取

涉及文件：

- `services/agent/stable_tasks.ts`
- `services/agent/router.ts`

### 10. 继续增强 CLI / 可观测性

可继续补充：

- 摘要刷新次数
- 向量检索是否命中 RPC 或 fallback
- 每轮耗时
- 每次检索 / 模型调用的简化统计

涉及文件：

- `scripts/agent_cli.ts`

---

## 测试补强

### 建议新增测试

- 长对话压缩后继续发课程社区写请求
- 一句内复合意图：memory + FAQ / memory + nearby / memory + course
- 切换 fast/reasoning model 后缓存 key 隔离
- FAQ 弱相关命中与知识库强相关命中的优先级
- 向量 RPC 错误码与 fallback 行为
- 运行时 embedding 加载失败后的稳定降级

---

## 下一批最值得做的顺序

1. 完善知识库导入链路
2. 提升运行时 embedding 可用性
3. 继续扩展稳定子任务覆盖面
4. 继续增强 CLI / 可观测性
