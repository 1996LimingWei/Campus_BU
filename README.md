# HKCampus

面向校园生活的一体化移动端应用（Expo + Supabase）。覆盖校园动态、地图、课程、教室、食堂、教师评价与 AI 助手等功能，适合作为校园生活工具箱的原型与落地项目。

**功能概览**
- 校园动态：分类信息流、发帖（图片/匿名/定位）、点赞、评论、实时更新
- 地图：校园地图（建筑/食堂标注）、定位与导航、地图卡片与评论
- 课程：课程列表/搜索/收藏、课程详情与评价、课程聊天、组队招募
- 课程交换：发布换课、筛选、评论、联系方式复制
- 教室/建筑：楼宇搜索与收藏、详情页导航、照片贡献
- 食堂：餐饮点列表、下单/菜单链接、点评与图片、餐饮地图
- 教师：筛选搜索、匿名评价/难度/标签、AI 总结
- 个人中心：头像上传、通知中心、语言切换、社交标签、帮助与退出
- AI Agent：实验性校园助手（LangGraph/DeepSeek，支持工具编排与 WebView）
- 多语言：简体中文 / 繁體中文 / English
- Demo 模式与生物识别登录

**快速开始**
1. 安装依赖
```bash
npm install
```
2. 配置环境变量（Windows 示例）
```cmd
copy .env.example .env
```
macOS/Linux 使用 `cp .env.example .env`
3. 启动开发环境
```bash
npm run start
```

**环境变量**
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

**常用命令**
```bash
npm run start
npm run android
npm run ios
npm run web
npm test
npm run test:e2e
```

**后端与数据**
这里使用 Supabase 作为认证、数据库与存储层。初始化与迁移脚本已放在项目根目录与 `supabase/` 中：
- `setup_schema.sql`
- `setup_teachers_db.sql`
- `setup_teaming_storage.sql`
- `setup_user_avatars_storage.sql`
- `fix_rls_for_import.sql`
- `fix_rls_for_submission.sql`
- `migrate_messages.sql`
- `add_user_schedules.sql`

如需启用课表 OCR 后端，参考 `backend/`：
1. 安装依赖并运行服务
```bash
cd backend
python -m venv .venv
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
2. 在 `.env` 中配置 OCR 服务地址
```env
EXPO_PUBLIC_OCR_API_URL=https://your-ocr-api.example.com
OCR_TEXT_ENGINE=ocr_space
OCR_SPACE_API_URL=https://api.ocr.space/parse/image
OCR_SPACE_API_KEY=your_ocr_space_api_key
OCR_SPACE_LANGUAGE=eng
OCR_SPACE_ENGINE=2
```
3. 后端会继续用模板规则定位课表块，块内文字识别走 OCR.Space API
4. 开发环境可指向本机或局域网服务；上架版本必须指向公网可访问的 HTTPS 地址，不能依赖本地 `main.py`
5. 如需按需付费部署，优先考虑 Cloud Run。部署说明见 [docs/cloud_run_ocr.md](/c:/Users/Tim/Documents/GitHub/CampusCopy/docs/cloud_run_ocr.md)

**目录结构**
- `app/`：Expo Router 页面与路由
- `components/`：通用组件
- `services/`：业务逻辑与数据访问（Supabase/Agent/功能模块）
- `data/`：校园建筑与位置数据
- `backend/`：OCR 后端（可选）
- `supabase/`：迁移与数据库相关文件

**配置说明**
- Demo 账号在 `constants/Config.ts` 中配置，便于演示与调试
- 语言配置在 `app/i18n/`
- Agent 配置在 `services/agent/config.ts`

**Expo 启动说明**
- `npm run start` 现在默认使用 `expo start --offline`。
- 这样可以避免在代理网络或受限网络下，Expo CLI 启动时出现 `fetch failed` 错误。
- 如果你想使用原来的在线启动方式，请运行 `npm run start:online`。
