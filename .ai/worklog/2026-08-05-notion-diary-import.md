# 2026-08-05 — Notion 日记导入 hpcore serenique diary 库

将 Notion「🔥 Diary」数据库的日记导入 hpcore 的 `serenique` 库 `diaries` 表。范围经用户确认：**仅导入**（不动 Notion 侧）；正文**不改动原文**（相对时间换算留待后续）；含图篇整篇跳过；日记日期（标题）修正为准确绝对日期。

## 执行过程

- **来源**：Notion 工作区 Serenique「🔥 Diary」库（data source `collection://312b0c0d-149b-8010-97dd-000b86c4c79a`），共 **38 篇**（2026-02-09 → 08-04）。
- **抓取**：Notion MCP `notion-fetch` 逐篇拉取，正文原样落盘 `notion_raw.jsonl`（子代理执行，38/38 成功；含图行、`<mention-date/>` 标记、`<empty-block/>` 均按字符保留）。
- **过滤**：**15 篇含图**（content 含 `prod-files-secure.s3` / `![`）→ 跳过，等待图片处理支持。
- **日期解析**：老页面标题是纯文本 `2026-7-8`（月日不补零），新页面是日期提及 `<mention-date start="2026-08-04"/>`（显示为 `@昨天`）；统一归一化为 `YYYY-MM-DD`。与上海时区创建日核对一致（含补记篇：标题 7-7 实为 7-8 所写、标题 7-4 实为 7-5 所写）。
- **正文清洗**：仅剥离 Notion 标记（`<mention-date/>`、`<empty-block/>` 等）成纯文本，保留段落换行；**用户文字一字未改**（正文中「昨天/上周X」等相对时间本次未换算，留待后续任务）。
- **导入**：本地生成单事务 SQL（`INSERT ... ON CONFLICT (diary_date) DO NOTHING`），`ssh hpcore 'docker exec -i postgres psql -U serenique -d serenique'` 管道执行。先干跑（`COMMIT`→`ROLLBACK`）验证 `INSERT 0 23`，再正式导入 COMMIT。
- **验证**：`diaries` 总数 5 → 28；导入的 23 条与 `entries.json` 按码点逐字符比对**全部一致**；原有 5 条（06-23 / 06-29 / 06-30 / 07-01 / 08-05 冒烟测试）未动。

## 结果

- 导入 **23 篇**，逐字符校验通过。
- 跳过 **15 篇**（含图，未导入；后续做图片支持时处理）。
- 无同日期冲突、无标题解析失败。

## 对下一次会话的提示（pitfalls）

- **Notion 标题即日记日期**，两种形态：老页面纯文本 `2026-M-D`（月日不补零）、新页面日期提及 `<mention-date start="YYYY-MM-DD"/>`（显示为 `@昨天`/`@上星期日`）。解析都要覆盖；页面 emoji 图标在 `title` 字段，不在 `名称` 字段。
- **补记现象**：标题日期与创建日可差 1 天（标题 7-7、创建 7-8）。本导入以**标题日期**为 diaryDate；正文相对时间的基准日按用户确认为**写作/创建当天**（上海时区）。
- **含图判定**：`notion-fetch` 输出中图片行形如 `![](https://prod-files-secure.s3...)`，是约 2KB/张的**签名 URL（5 分钟过期）**，会显著膨胀上下文。后续做图片导入应走 Notion 文件 API 取原始文件，别用抓取文本里的签名 URL。
- **JS 长度 vs PG `length()`**：表情符是 UTF-16 代理对，JS `.length` 计 2、PG 计 1；跨层比对用 `Array.from(s)` 按码点，勿按 `.length` 断言。
- **`$$` 美元引号**：SQL 经 `ssh`/`docker exec` 多层 shell 时 `$$` 会被远端 shell 展开成 PID（实测变成 `1850039`）。跨层传 SQL 用普通单引号 + 外层转义，别用 `$$`。
- **临时产物**：`notion_raw.jsonl` / `entries.json` / `import.sql` / `transform.js` 在本机会话临时目录（`~/.claude/jobs/<job>/tmp/`），会话删除即清空，未入 git。
- **正文相对时间换算**（「昨天/上星期/周X」等）为后续任务，基准=创建当天（上海时区）。
