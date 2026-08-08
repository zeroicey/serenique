# 2026-08-08 — Notion 日记 → Moment 全量迁移（含附件，进生产库）

将 Notion「🔥 Diary」库 38 篇日记 + 生产库 diaries 表 5 篇应用内日记（含 08-07 这两天写的）全部迁移为带「日记」标签的 Moment，共 43 条；25 张图片附件通过生产服务器本机 HTTP 接口上传挂载。背景：用户决定砍掉日记模块、融合进散记（需求：`.ai/requirements/2026-08-08-diary-merge-into-moment.md`，规则细节全在里面，这里只记执行与坑）。

## 执行过程

1. **摸底**：Notion MCP 已接（远程 `https://mcp.notion.com/mcp`，opencode `type: remote` + `opencode mcp auth notion`）；生产库经 ssh 直连 psql 查 diaries/moments/tags。确认生产 API 已是含 tag 模块的新镜像（`GET /api/tags` 返回空表）。
2. **抓取**：派子代理逐篇 notion-fetch 38 篇 → `notion_raw.jsonl` + `manifest.json`；25 个附件 URL（S3 签名、5 分钟过期）fetch 后**立即** curl 下载（30M）。
3. **转换**：本地 python 生成 `migration.json`（43 条：日期行 + 正文 + 附件清单 + createdAt UTC 值）。
4. **执行**：产物 scp 到 hpcore `/tmp/notion-migrate/`，服务器端脚本（`run_migration.py`）从 `/srv/compose/serenique/.env` 读 AUTH_TOKEN（不离开服务器），curl localhost:3000：建「日记」标签 → 上传 25 附件 → 创建 43 moments → 写 mapping.json。
5. **回填**：`UPDATE moments SET created_at/updated_at`（43 条，UTC 值）；`UPDATE blobs SET original_name = display_name`（25 条，上传文件名是编号，改成 `2026-02-10-1.png` 样式）。
6. **清理**：`DELETE FROM diaries`（28 行全删，用户已确认）；服务器 /tmp 产物删除。

## 验证

- API 层：`GET /api/moments?tag=<日记tag>` → total 43，按 createdAt 倒序，tags/attachments 字段完整
- 抽查：08-02 跨日 mention 转 `8月3日 00:21` ✓；02-10 createdAt=`2026-02-09 17:16:00`(UTC)=上海 01:16 ✓；02-25 四附件 displayName/原名/mime/size 全对 ✓
- 转换脚本全量断言：无标签残留、无超 10000 字、均含日期行 ✓

## 坑 / 对下一次会话的提示

1. **hpcore 直连！** 本机 `~/.ssh/config` 已配 `Host hpcore 10.126.126.2`（Easytier 组网），`ssh hpcore` / `scp hpcore:...` 直连即可，**不要**用 runbook 里的 `ssh -J hpazure hpcore`（绕 Azure 中转，实测 30M 传输 3 分钟超时；直连 85 秒传完）。
2. **生产库存 UTC**：moments.created_at 是 UTC（凌晨 2 点写的 moment 存的是前一天 18:01）。迁移回填必须上海时分 -8h 转 UTC，否则 App 显示时间全部错位。drizzle 的 `timestamp()` 无 withTimezone，但驱动按 UTC 写。
3. **Notion mention-date 全带绝对时间**：`<mention-date start="2026-08-03" startTime="00:21" timeZone="Asia/Shanghai"/>`，页首那个即真实写作时分（≈页面创建时分）。不是真相对时间，转换无歧义。regex 匹配时**必须吃掉结尾 `/>`**（第一次写漏，残留了一堆 `/>` 在正文里）。
4. **Notion MCP OAuth 令牌不能直接当 Notion REST API token**（REST 401）。抓取必须走 MCP 工具（子代理执行防上下文膨胀）；附件下载用 fetch 返回的签名 URL 立刻 curl。
5. **S3 签名 URL 5 分钟过期**：抓取与下载必须逐篇进行，不能先抓完再下。
6. **curl 上传 blob 显式带 type**：`-F "file=@path;type=image/heic"`，否则 .heic 可能被当作 octet-stream，moment 附件校验（image/audio/video 白名单）会 400。
7. **服务器端脚本读 token 最安全**：AUTH_TOKEN 只在 hpcore 上读进环境变量，全程不经过本机终端/日志。curl `-f` 失败即停，靠打印序号定位。
8. **tar 传输用 `tar czf` 先打包**：30M/25 个小文件逐个 scp 更慢；解包时 LIBARCHIVE.xattr 警告是 macOS 扩展属性噪音，无害。
9. 正文里 Notion 的 `\:` `\~` `\|` `\*` 是转义，需还原；callout/quote/code 包装标签剥掉只留内部文字。
10. 首轮导入（08-05）把 mention 直接剥掉导致跨日时间信息丢失，本轮改为转成文字保留——同一数据源两轮处理方式不同，注意别混用。

## 遗留

- 日记模块代码移除（schema/handler/router/CLI/Web/移动端）是后续开发任务，见需求文档 §3
- `.ai/runbooks/hpcore-deploy.md` 的 ssh 入口已同步改为直连（见该文件）
