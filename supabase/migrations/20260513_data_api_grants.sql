-- ============================================================================
-- Supabase Data API GRANT 补丁
-- 原因：2026-05-30 起，新建项目的 public 表不再默认暴露给 Data API；
--       2026-10-30 起，所有现有项目强制执行。
-- 本迁移为所有已存在的 public 表补上显式 GRANT，确保 supabase-js / PostgREST
-- 继续正常工作。RLS 策略不变，GRANT 仅控制"角色能否碰到表"。
--
-- 分类逻辑：
--   公开数据（课程/建筑/教师/帖子等）→ anon 可 SELECT，authenticated 可 CRUD
--   私有用户数据（课表/日历/私信/通知等）→ 仅 authenticated 可 CRUD
--   管理员表 → 仅 authenticated 可 CRUD（RLS 决定谁能看/改）
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. 公开数据表：anon SELECT + authenticated CRUD
-- ──────────────────────────────────────────────────────────────────────────────

-- 课程 / 建筑 / 教师
grant select                                                     on public.courses       to anon;
grant select, insert, update, delete                             on public.courses       to authenticated;
grant select, insert, update, delete                             on public.courses       to service_role;

grant select                                                     on public.buildings     to anon;
grant select, insert, update, delete                             on public.buildings     to authenticated;
grant select, insert, update, delete                             on public.buildings     to service_role;

grant select                                                     on public.teachers      to anon;
grant select, insert, update, delete                             on public.teachers      to authenticated;
grant select, insert, update, delete                             on public.teachers      to service_role;

-- 课程评价 / 教师评价
grant select                                                     on public.course_reviews      to anon;
grant select, insert, update, delete                             on public.course_reviews      to authenticated;
grant select, insert, update, delete                             on public.course_reviews      to service_role;

grant select                                                     on public.teacher_reviews     to anon;
grant select, insert, update, delete                             on public.teacher_reviews     to authenticated;
grant select, insert, update, delete                             on public.teacher_reviews     to service_role;

grant select                                                     on public.teacher_review_likes to anon;
grant select, insert, update, delete                             on public.teacher_review_likes to authenticated;
grant select, insert, update, delete                             on public.teacher_review_likes to service_role;

-- 发现板块（帖子 / 评论 / 点赞）
grant select                                                     on public.posts         to anon;
grant select, insert, update, delete                             on public.posts         to authenticated;
grant select, insert, update, delete                             on public.posts         to service_role;

grant select                                                     on public.post_comments to anon;
grant select, insert, update, delete                             on public.post_comments to authenticated;
grant select, insert, update, delete                             on public.post_comments to service_role;

grant select                                                     on public.post_likes    to anon;
grant select, insert, update, delete                             on public.post_likes    to authenticated;
grant select, insert, update, delete                             on public.post_likes    to service_role;

-- 论坛
grant select                                                     on public.forum_posts     to anon;
grant select, insert, update, delete                             on public.forum_posts     to authenticated;
grant select, insert, update, delete                             on public.forum_posts     to service_role;

grant select                                                     on public.forum_comments  to anon;
grant select, insert, update, delete                             on public.forum_comments  to authenticated;
grant select, insert, update, delete                             on public.forum_comments  to service_role;

grant select                                                     on public.forum_upvotes   to anon;
grant select, insert, update, delete                             on public.forum_upvotes   to authenticated;
grant select, insert, update, delete                             on public.forum_upvotes   to service_role;

-- 课程交换 / 评论
grant select                                                     on public.course_exchanges   to anon;
grant select, insert, update, delete                             on public.course_exchanges   to authenticated;
grant select, insert, update, delete                             on public.course_exchanges   to service_role;

grant select                                                     on public.exchange_comments  to anon;
grant select, insert, update, delete                             on public.exchange_comments  to authenticated;
grant select, insert, update, delete                             on public.exchange_comments  to service_role;

-- 组队 / 评论
grant select                                                     on public.course_teaming   to anon;
grant select, insert, update, delete                             on public.course_teaming   to authenticated;
grant select, insert, update, delete                             on public.course_teaming   to service_role;

grant select                                                     on public.teaming_comments to anon;
grant select, insert, update, delete                             on public.teaming_comments to authenticated;
grant select, insert, update, delete                             on public.teaming_comments to service_role;

-- 美食评论
grant select                                                     on public.food_reviews        to anon;
grant select, insert, update, delete                             on public.food_reviews        to authenticated;
grant select, insert, update, delete                             on public.food_reviews        to service_role;

grant select                                                     on public.food_review_likes   to anon;
grant select, insert, update, delete                             on public.food_review_likes   to authenticated;
grant select, insert, update, delete                             on public.food_review_likes   to service_role;

grant select                                                     on public.food_review_comments to anon;
grant select, insert, update, delete                             on public.food_review_comments to authenticated;
grant select, insert, update, delete                             on public.food_review_comments to service_role;

-- 课程提交审核（公开查看已批准 + 自己的提交）
grant select                                                     on public.course_submissions  to anon;
grant select, insert, update, delete                             on public.course_submissions  to authenticated;
grant select, insert, update, delete                             on public.course_submissions  to service_role;

-- 用户关注关系（公开读取用于计数/关系图）
grant select                                                     on public.user_follows  to anon;
grant select, insert, update, delete                             on public.user_follows  to authenticated;
grant select, insert, update, delete                             on public.user_follows  to service_role;

-- 通知（用户看自己的，系统插入）
grant select, insert, update, delete                             on public.notifications to authenticated;
grant select, insert, update, delete                             on public.notifications to service_role;

-- 互动表（poke/wave）
grant select, insert, update, delete                             on public.interactions  to authenticated;
grant select, insert, update, delete                             on public.interactions  to service_role;

-- 聊天消息
grant select, insert, update, delete                             on public.messages      to authenticated;
grant select, insert, update, delete                             on public.messages      to service_role;

-- agent 知识库（公开读取，已在 20260325 迁移中授权，此处确保 service_role 也有权限）
grant select, insert, update, delete                             on public.agent_knowledge_base to service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. 私有用户数据表：仅 authenticated + service_role（不给 anon）
-- ──────────────────────────────────────────────────────────────────────────────

-- agent 记忆
grant select, insert, update, delete                             on public.agent_memory          to authenticated;
grant select, insert, update, delete                             on public.agent_memory          to service_role;

-- 收藏
grant select, insert, update, delete                             on public.course_favorites      to authenticated;
grant select, insert, update, delete                             on public.course_favorites      to service_role;

grant select, insert, update, delete                             on public.building_favorites     to authenticated;
grant select, insert, update, delete                             on public.building_favorites     to service_role;

-- 用户课表
grant select, insert, update, delete                             on public.user_schedules         to authenticated;
grant select, insert, update, delete                             on public.user_schedules         to service_role;

-- 课表导入管线
grant select, insert, update, delete                             on public.schedule_import_jobs   to authenticated;
grant select, insert, update, delete                             on public.schedule_import_jobs   to service_role;

grant select, insert, update, delete                             on public.schedule_import_items  to authenticated;
grant select, insert, update, delete                             on public.schedule_import_items  to service_role;

grant select, insert, update, delete                             on public.user_schedule_entries  to authenticated;
grant select, insert, update, delete                             on public.user_schedule_entries  to service_role;

-- 用户日历事件
grant select, insert, update, delete                             on public.user_calendar_events   to authenticated;
grant select, insert, update, delete                             on public.user_calendar_events   to service_role;

-- 推送 token
grant select, insert, update, delete                             on public.user_push_tokens       to authenticated;
grant select, insert, update, delete                             on public.user_push_tokens       to service_role;

-- 私信
grant select, insert, update, delete                             on public.direct_conversations   to authenticated;
grant select, insert, update, delete                             on public.direct_conversations   to service_role;

grant select, insert, update, delete                             on public.direct_messages        to authenticated;
grant select, insert, update, delete                             on public.direct_messages        to service_role;

-- EULA 同意记录
grant select, insert, update, delete                             on public.user_eula_consents     to authenticated;
grant select, insert, update, delete                             on public.user_eula_consents     to service_role;

-- 用户屏蔽
grant select, insert, update, delete                             on public.user_blocks            to authenticated;
grant select, insert, update, delete                             on public.user_blocks            to service_role;

-- 举报
grant select, insert, update, delete                             on public.reports                to authenticated;
grant select, insert, update, delete                             on public.reports                to service_role;

-- 用户档案
grant select, insert, update, delete                             on public.users                  to authenticated;
grant select, insert, update, delete                             on public.users                  to service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. 管理员 / 审计表：仅 authenticated + service_role
-- ──────────────────────────────────────────────────────────────────────────────

-- 管理员表（用户可查自己状态，管理员可增删改）
grant select, insert, update, delete                             on public.app_admins            to authenticated;
grant select, insert, update, delete                             on public.app_admins            to service_role;

-- 审核操作日志（管理员 + 操作者可读，认证用户可插入）
grant select, insert, update, delete                             on public.moderation_actions    to authenticated;
grant select, insert, update, delete                             on public.moderation_actions    to service_role;

-- 用户封禁
grant select, insert, update, delete                             on public.user_bans             to authenticated;
grant select, insert, update, delete                             on public.user_bans             to service_role;
