# AI 用户视角测试反馈（CLI + MCP）

日期: 2026-08-05

适用范围: `apps/cli/` + `services/api/` + `services/mcp/`（双通道实测）

前置记录: `2026-08-05-cli-evaluation-decisions.md`、`2026-08-05-cli-evaluation-and-testing.md`（前一轮 CLI 评估）、`2026-08-05-event-module.md`（event 需求）

测试环境: 本机 `localhost:3000` 运行中的 API 服务（当前版本 `3c340ca`），CLI 通过 `serenique init` 配置；MCP 通过 `http://localhost:3001/mcp` 接入。

## 测试方法与范围

以真实用户身份完整走了一遍双通道工作流：

- **CLI**（`/usr/local/bin/serenique`）：init/config、diary 全 CRUD、moment（含附件关联）、task group/task 全 CRUD + 状态流转、event 全 CRUD、blob（upload/download/info/link/attach/detach/attachments/cleanup）、`--json` 输出、删除确认交互、错误路径（无效 ID / 缺参数 / 非法日期 / 重复创建 / 超字数 / 结束早于开始）。
- **MCP**：27 个工具全部调用过（各实体 create/list/get/update/delete + upload_blob 指引），并做了跨通道一致性验证（CLI 建 → MCP 读改删，反之亦然）。
- **数据清理**：测试产生的数据已全部删除，环境恢复原状（日记 3 / 闪念 11 / 任务 0 / 任务组 0 / 事件 0 / 文件 8，与测试前一致）。

## 待处理问题（按优先级）

### P1 · HTTP API 对无效 UUID 返回 500（非 400/404）

- **现象**：`serenique diary get not-a-real-id` → `✗ 错误: Internal server error (HTTP 500)`。
- **复现**：任意模块 `get/update/delete` 传非 UUID 字符串均可触发；MCP 侧因 zod 校验（`Invalid UUID` → 400）不受影响，只有直连 HTTP 的 CLI 暴露。
- **根因**：`services/api/src/modules/diary/diary.handler.ts` 的 `getId()` 仅检查 `!id`（Missing id parameter），未校验 UUID 格式，无效值直接下钻 `diaryService.get()` 触发数据库异常 → `handleError` 落 500。task/event/blob 等模块的 handler 大概率同款模式，需一并排查。
- **建议**：handler 层抽公共的 UUID 解析校验（可复用 MCP 侧同款 zod pattern），无效 UUID 返回 400 `VALIDATION`；服务端顺手兜底 `handleError` 对未知错误保持 500 语义即可。

### P2 · MCP `upload_blob` 返回容器内地址，curlExample 在宿主机不可用

- **现象**：`upload_blob` 指引返回 `"uploadEndpoint": "http://api:3000/api/blobs/upload"`，`curlExample` 里的主机名 `api` 在宿主机无法解析，用户照抄必失败。
- **建议**：MCP 服务暴露可配置的对外 base URL（如环境变量注入宿主可达地址），或返回相对路径 + 提示拼接。

### P2 · CLI 事件表格输出显示 UTC 时间，无时区标注

- **现象**：`event create -s 2026-08-05T09:00:00+08:00` 后表格显示 `开始时间: 2026-08-05T01:00:00`，未标注时区（JSON 模式带 `Z` 尚可辨识）。用户输入 +08:00 却看到凌晨时间，易误判。
- **建议**：表格模式按本地时区渲染，或至少追加 `Z`/`+00:00` 标注；`event list` 表格同样处理。

### P3 · MCP `list_events` 返回结构与其余 list 不一致

- **现象**：`list_events` 返回裸数组 `[{...}]`，而 `list_diaries`/`list_moments`/`list_tasks`/`list_task_groups`/`list_blobs` 均返回 `{items, total}`。AI/脚本解析需分支处理，易踩坑。
- **建议**：统一为 `{items, total}`（若 HTTP 契约即数组，可在 MCP 层包装）。

### P3 · `blob detach` 帮助文档与行为不符

- **现象**：对 moment 类型附件执行 `blob detach <id>` 返回 400「该业务类型的附件请使用对应模块 API 创建或删除」，但 `--help` 只写「删除一条业务关联记录」，未说明适用类型，按帮助操作直接失败。
- **建议**：帮助文案注明「仅支持非 moment 类型（如 diary）」，或错误提示里列出可用命令（moment 已有 `moment detach` 引导先例）。

### P3 · `blob upload --json` 字段名与其余命令不一致（已知设计，提示注意）

- **现象**：`blob upload --json` 返回 `data.results[].blobId`，其余命令返回 `data.id`。据 `2026-08-05-cli-evaluation-decisions.md` D6，批量结果结构是**有意设计**，不算缺陷；但脚本方按统一路径解析会失败，建议在文档/帮助里显式标注（本次测试即因此踩坑一次）。

## 验证通过项（供回归参考，均为双通道实测）

- 日记：同日重复创建 409、`--date` 格式校验、update 只改 content 不改日期，全部正确。
- 闪念：500 字上限（501 拒 / 500 收）、附件仅限图片/音视频且不支持 SVG（错误提示清晰）、`--blob-id` 多附件与 sort-order 透传。
- 任务：`status` 流转 todo→done 自动记 `completedAt`、任务组删除**连带删除组内任务**（实测残留任务数 0）、`pageSize` 上限 50 校验。
- 事件：开始晚于结束报 400、全天事件、窗口重叠查询。
- 文件：SHA-256 去重有效（重复上传返回同一 ID 不重复存储）、临时链接签名 URL 实测 HTTP 200、下载逐字节一致、`blob attach` 对 moment 给出「请用 `serenique moment attach`」的引导提示。
- 删除安全：所有删除默认确认（`y/N`），`--force` 跳过；拒绝确认 exit 1 且提示「操作已取消」。
- 错误语义：缺必填 flag / 非法日期 / 超字数均 exit 非零，中文提示 + HTTP 状态码。
- MCP 全工具参数描述完整，错误响应带 `Expected parameters` 说明，AI 可据此自纠。

## 对处理方的建议

1. **P1 优先**：这是本次测试唯一够得上「缺陷」级别的问题（500 语义掩盖了参数错误），建议在 `services/api` handler 层统一修复并补单测；修复后可回归 `diary/task/event/blob` 四模块的 `get/update/delete` 无效 ID 路径。
2. **P2 两项**影响真实用户可直接感知（复制 curl 失败、时间误读），建议本轮一并处理。
3. **P3 属契约打磨**，可并入既有 minor/nit 清单（见 `2026-08-05-cli-evaluation-decisions.md`「遗留打磨项」）排期。
4. event 模块较新，`list_events` 结构与表格时区建议由 event 模块负责人确认契约后统一。
