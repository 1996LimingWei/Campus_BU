# HKCampus

面向香港浸会大学校园生活的一体化移动应用，基于 Expo + React Native + TypeScript + Supabase 构建，覆盖校园动态、地图导航、课程与换课、教师评价、食堂信息、私信互动以及 AI 助手等场景。

## 当前进度

截至 2026-04-17，项目已进入可持续迭代阶段，近期重点已经从“功能铺设”转向“合规、审核和稳定性完善”。

### 最近完成的重点

- 已完成 App Store Guideline 1.2 相关整改，补齐 UGC 准入协议、举报、拉黑、内容拦截和审核工作流。
- 已补充法律与审核材料，包括隐私政策、支持页面、审核备注和录屏说明文档。
- 已完成账号注销流程校验，并补充对应测试。
- AI 日报能力已落地，并调整为默认关闭、用户主动订阅。
- 社区分享卡片、国际化对齐、个人页性能与若干审核问题已完成修复。

### 当前版本

- App version: `1.2.1`
- iOS build: `10`
- Android versionCode: `3`

## 核心能力

- 校园动态：发帖、图片、匿名、定位、点赞、评论、举报、拉黑与审核联动
- 校园地图：建筑检索、地图标注、定位、导航、地点详情
- 课程与换课：课程浏览、收藏、评价、聊天、换课信息发布
- 教室与建筑：教学楼与教室查询、详情页导航
- 食堂模块：餐厅列表、详情、图片、点评与地图入口
- 教师评价：教师检索、匿名评价、标签与 AI 总结
- 社交能力：关注、粉丝、私信、消息会话、个人主页
- AI 助手：基于 LangGraph 的校园问答与工具调用能力
- OCR 课表导入：支持通过独立 Python 后端接入 OCR 识别流程
- 多语言：简体中文、繁体中文、English

## 技术栈

- App: Expo 54, React Native 0.81, React 19, Expo Router
- Language: TypeScript
- Backend/Data: Supabase Auth, Postgres, Storage, Edge Functions
- AI: LangGraph, LangChain, DeepSeek/OpenAI compatible APIs
- Optional OCR backend: FastAPI + Python
- Test: Jest + React Native Testing Library + Maestro E2E

## 目录结构

- `app/`：Expo Router 页面与路由
- `components/`：通用 UI 与业务组件
- `services/`：Supabase、Agent、通知、内容审核等业务服务
- `data/`：校园、课程、教师、FAQ 等基础数据
- `backend/`：OCR 与图像解析相关的 Python 服务
- `supabase/`：数据库迁移、函数与管理脚本
- `public-site/`：对外公开的隐私政策与支持页面
- `docs/`：产品、审核、隐私、OCR、排障等文档

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

Windows:

```cmd
copy .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

### 3. 启动开发环境

```bash
npm run start
```

默认使用 `expo start --offline`，以降低受限网络环境下 Expo CLI 启动失败的概率。如需在线模式，可使用：

```bash
npm run start:online
```

## 常用命令

```bash
npm run start
npm run start:online
npm run android
npm run ios
npm run web
npm test
npm run test:e2e
```

## 环境变量

最小可用配置如下：

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_OCR_API_URL=https://your-ocr-api.example.com
OCR_TEXT_ENGINE=ocr_space
OCR_SPACE_API_URL=https://api.ocr.space/parse/image
OCR_SPACE_API_KEY=...
OCR_SPACE_LANGUAGE=eng
OCR_SPACE_ENGINE=2
EXPO_PUBLIC_DEEPSEEK_API_KEY=...
EXPO_PUBLIC_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

## Supabase 与数据库

项目依赖 Supabase 处理认证、数据存储、内容审核、消息与通知。数据库相关内容主要位于：

- `supabase/migrations/`
- `supabase/functions/send_push_notification/`
- `scripts/database/`

近期关键迁移包括：

- 收藏能力
- Agent memory / knowledge base
- Forum 与 reply support
- 关注关系与私信
- 管理员系统与内容删除策略
- UGC moderation compliance 与 enforcement

## OCR 后端（可选）

如果需要启用课表 OCR，可单独启动 `backend/` 服务：

```bash
cd backend
python -m venv .venv
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

部署说明见 `docs/ocr/cloud_run_ocr.md`。

## 测试与质量保障

- 单元测试位于 `__tests__/`
- E2E 流程位于 `e2e/`
- 内容审核、FAQ、校园数据、认证、AI OCR、Agent 等模块均已覆盖部分自动化测试

## 审核与对外文档

- 隐私政策页面：`public-site/privacy-policy.html`
- 支持页面：`public-site/support.html`
- App Review 备注：`docs/app-store-review-notes.md`
- Apple Guideline 1.2 材料：`docs/app-review/`
- UGC 回复草稿：`docs/app-store-ugc-reply-2026-04-14.md`

## 说明

- Demo / 审核相关配置可在 `constants/Config.ts` 中查看。
- 国际化资源位于 `app/i18n/`。
- Agent 相关配置位于 `services/agent/config.ts`。

项目当前的主线目标已经从“完成基础页面”切换为“提升审核通过率、内容安全、稳定性与真实校园场景可用性”。如果你接手继续开发，建议优先阅读 `docs/` 下的审核、隐私、OCR 与产品路线图文档。
