# 日记模块并入 Moment（用「日记」标签替代）需求文档

- 日期：2026-08-08
- 状态：✅已实施（2026-08-09 模块代码移除 + 生产部署 + DROP TABLE 全部完成）
- 范围：数据迁移（Notion → 生产库 Moments）、后续模块开发（services/api diary 模块移除、客户端同步）
- 前置记录：`2026-08-05-diary-content-forms.md`（被本需求取代，日记不再扩展内容形态）、`2026-08-08-api-tag-module.md`（标签模块）、`2026-08-05-notion-diary-import.md`（第一轮 Notion 导入）

---

## 1. 背景与目标

用户在使用中感到「日记」与「散记（Moment）」功能冲突，且散记使用频率更高、已支持附件和标签。决定**砍掉日记模块，将其融合进散记**：日记内容迁移为带「日记」标签的 Moment。Moment 的附件能力（图片/视频/音频）同时解决了此前 Notion 日记含图内容无法迁移的问题。

## 2. 数据迁移（本轮已执行）

Notion「🔥 Diary」库 38 篇 + 生产库 diaries 表 5 篇应用内日记 → 生产库 moments 表，共 **43 条**，统一打上「日记」标签，25 张图片附件走生产 HTTP 接口上传并挂载。

### 已定规则

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 创建时间时分 | **标题日期 + 真实写作时分**（页首 mention-date 的 startTime，上海时区；36/38 篇与页面创建时分一致）。凌晨/补记的日记自然按标题日期归位 |
| ② | 标题日期 vs 创建日期不一致 | **以标题日期为归属日**（与 08-05 导入一致）。实测 38 篇仅 3 篇不一致：02-10（02-09 23:28 写）、02-22（02-23 00:23 跨零点写）、07-07（07-08 12:01 补记）。另有两篇标题同为 2026-7-4（00:58 与 12:20 各写一篇），分别迁移，时分天然区分 |
| ③ | 相对时间（mention-date） | Notion 全部 70 个 mention-date **都携带绝对时间**（startTime + Asia/Shanghai），转换确定：页首第一个吸收为顶部日期行（`YYYY-MM-DD`）；正文中同日显示 `HH:MM`、跨日显示 `M月D日 HH:MM`（如 `现在 Jerry 还没打到车 8月3日 00:21 现在打到了`）。**不是**真·相对时间，无需猜基准日 |
| ④ | 正文格式 | 顶部日期行 `YYYY-MM-DD\n\n` + 正文；剥离 `<empty-block/>`、callout 包装、`\:` `\~` 等转义；图片行从正文剥离为附件（宫格展示，原始行内位置丢失，用户接受） |
| ⑤ | 附件 | Notion 文件走签名 URL（5 分钟过期，fetch 后立即下载）；上传走**生产服务器本机** HTTP 接口（AUTH_TOKEN 在服务器 .env 读取，不离开服务器）；displayName 格式 `YYYY-MM-DD-N.ext` |
| ⑥ | 时间存储 | 生产库 moments.created_at 存 **UTC**（与既有数据一致）；SQL 回填时按上海时区→UTC 换算 |
| ⑦ | 旧数据清理 | 迁移完成后删除 diaries 表全部 28 行（23 篇 08-05 导入 + 5 篇应用内日记），内容已完整进入 Moments |
| ⑧ | 6 月旧应用日记 | 06-23 / 06-29 / 06-30 / 07-01 四篇（Notion 无对应，开发期应用内所写）一并迁成带「日记」标签的 Moment，createdAt 保持原值 |

## 3. 模块移除（2026-08-09 已完成）

- commit `2e57031`（feat!）：api 删 `modules/diary/` 整目录 + exports/app/schema/audit diary.delete 事件 + auth e2e 改用 moment；mcp 删 diary 工具；cli 删 diary 命令树 + README；web/mobile 删 diary feature（并行会话已先完成）
- 迁移 `drizzle/0012_drop_diaries.sql`（`DROP TABLE "diaries" CASCADE`）
- 生产：hpcore 部署新镜像（digest `34f5aa23…`）→ `/api/diaries*` 404 → psql DROP TABLE + 记入 `__drizzle_migrations`（id=13）
- 验证：root typecheck ✓、api 229 测试 0 fail、mcp 7 pass、cli build/vet/test 全绿；`/api/moments` 正常
- 遗留：tag 注册表跨文件泄漏导致全量跑集成测试 1 fail（既有问题，未修）

## 4. 数据源参考

- Notion data source：`collection://312b0c0d-149b-8010-97dd-000b86c4c79a`（38 篇，2026-02-09 → 08-04）
- 生产迁移日志：`.ai/worklog/2026-08-08-notion-diary-to-moment-migration.md`
- 本地临时产物（会话目录，可重建）：manifest.json / notion_raw.jsonl / migration.json / transform.py / attachments/
