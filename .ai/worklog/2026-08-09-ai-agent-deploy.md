# 2026-08-09 — AI 助手模块生产部署（hpcore）

AI 模块（宁序）全栈（后端 + Web 前端）部署到生产 hpcore：模型走 opencode 网关（OPENCODE_API_KEY，改用默认 `opencode-go/deepseek-v4-flash`——用户已有 opencode 套餐，不充 DeepSeek），会话卷 `/data/sessions`，容器出站经 mihomo 代理。流程细节见 `.ai/runbooks/hpcore-deploy.md`（AI 配置小节 + fake-ip 代理坑）。

## 改动

- **代码**：`env.ts` 默认模型 `opencode-go/deepseek-v4-flash` + `.env.example`/AGENTS.md/需求文档同步（commit `3bb3a75`）
- **服务器**（hpcore）：
  - `.env` 追加 `OPENCODE_API_KEY`（opencode 网关 key，从本机 auth.json 的 opencode-go 凭据）
  - `compose.yml`：加 `serenique-ai-sessions:/data/sessions` 卷 + `HTTP_PROXY/HTTPS_PROXY=http://host.docker.internal:7890` + `extra_hosts host.docker.internal:host-gateway` + `NO_PROXY`
  - 镜像按 digest 精确拉取（df21de56…）→ tag latest → `docker compose up -d --force-recreate api`（绕过加速器 tag 缓存）

## 验证（生产实测）

- 容器 healthy；`/health` 200；`/data/sessions` 属主 serenique(10001) 可写
- WS 未认证升级被拒（401，认证中间件在升级前生效）
- 容器内冒烟：`isAiEnabled: true` → 会话创建 → `opencode-go/deepseek-v4-flash` 真实对话「今天是星期日。」→ 消息落盘 2 条 → 会话文件已清理

## 坑 / 对下一次会话的提示（已入 runbook）

- **hpcore fake-ip DNS 劫持**：家庭网关返回 198.18.x.x（mihomo fake-ip），容器/宿主直连公网全部 TCP 超时（ping 通、docker pull 例外——走加速器）。解法：容器走本机 mihomo（*:7890）HTTP 代理，Bun fetch 认 `HTTPS_PROXY` env。**任何新的容器出公网需求都要走该代理**。
- **SSH 通道不稳**：本机直连 hpazure 的 ssh 频繁 banner 超时/broken pipe（docker exec 重负载命令时尤甚）——用临时 ssh config（ProxyCommand 走本机代理 7897 + ProxyJump hpcore）稳定得多；容器内跑长命令改 nohup + 轮询输出文件。
- **容器内脚本路径**：`@/` 别名在容器内要放项目目录（`-w /app/services/api bun tmp-x.ts`）才能解析；容器 /tmp 下跑会 `Cannot find module '@/...'`；容器重建（force-recreate）会清空 /tmp。
- ModelRuntime.create() 在模型目录刷新超时会 99% CPU 空转（无凭据或网络不通时）——isAiEnabled 卡死是网络问题先兆。

## 遗留

- 浏览器端到端验收：用户登录 https://serenique.0icey.icu/ai → 会话 → 「帮我创建一个任务：写周报」→ 工具卡片 → 打断/停止（部署冒烟已覆盖模型/对话/落盘链路，UI 交互待人工确认）
- 生产浏览器需走 `serenique.0icey.icu`（pages.dev 前端）——前端已部署过 Cloudflare？本次未动前端发布（apps/web 改动需重新发布到 pages.dev，检查 `.ai/runbooks/web-cloudflare-deploy.md`）
