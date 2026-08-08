# Serenique AI 记忆系统重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `.ai/` 从被动归档升级为自动捕获的记忆系统：新增 runbooks/archive/inbox 目录与索引，5 个记忆 skill 自动触发捕获，memory 插件事件驱动兜底，AGENTS.md 更新纪律。

**Architecture:** 三层自动捕获——skill（description 触发，agent 自觉捕获）为主角，插件（session.idle 事件，机器级兜底写 inbox）为兜底，AGENTS.md 纪律为双保险。`.ai/` 结构只新增目录不移动现有 worklog/decisions（零链接破坏）。

**Tech Stack:** markdown 文档、opencode skill（`.opencode/skills/*/SKILL.md`）、opencode plugin（`.opencode/plugin/*.ts`，`@opencode-ai/plugin` 1.18.15 已安装）、opencode.json。

## Global Constraints

- 所有用户可见文案用中文
- `worklog/`、`decisions/` 现有文件一个不动（零链接破坏）
- 标准流程只写进 `runbooks/`，worklog 不重复收录（已有流程描述加一行指针）
- skill frontmatter 必须含 `name`（小写连字符，匹配目录名）和 `description`（第三人称，前载触发关键词，覆盖 what + when）
- 插件只能写 `.ai/inbox/`，不做分类/归档判断
- 不用引入新依赖；插件复用 `.opencode/package.json` 已有的 `@opencode-ai/plugin` 1.18.15
- 遵循 spec：`docs/superpowers/specs/2026-08-08-ai-memory-system-design.md`

---

### Task 1: `.ai/` 新目录与总索引 README

**Files:**
- Create: `.ai/README.md`
- Create: `.ai/runbooks/`、`.ai/archive/`、`.ai/inbox/`（目录，含 `.gitkeep`）

**Interfaces:**
- Consumes: 无
- Produces: `.ai/README.md`（后续所有任务的 skill/plugin/runbook 都在此登记索引）；目录结构供 Task 2-4 写入

- [ ] **Step 1: 创建目录**

```bash
mkdir -p .ai/runbooks .ai/archive .ai/inbox
touch .ai/runbooks/.gitkeep .ai/archive/.gitkeep .ai/inbox/.gitkeep
```

- [ ] **Step 2: 写 `.ai/README.md`**

```markdown
# 项目记忆（.ai/）

Serenique 的项目记忆，正式文档。进 `.ai/` 前先读本文件。

## 目录职责

| 目录 | 职责 | 生命周期 |
|------|------|---------|
| `worklog/` | 每日流水账：做了什么、验证、坑、「对下一次会话的提示」 | 永久保留，权威历史 |
| `decisions/` | 决策记录（ADR）：Why / How to apply，含拒绝/延期项 | 永久保留 |
| `requirements/` | 需求文档，头部状态行：✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决 | 状态总表见 `requirements/README.md` |
| `architecture/` | 当前有效的架构/设计文档；被取代的加「已被 XX 取代」横幅 | 过期进 `archive/` |
| `runbooks/` | **标准流程手册，唯一事实源**（部署/上传/装机/构建/发布） | 流程变化时原地更新 |
| `archive/` | 死文档（实施完的 plan、被取代的设计） | 只进不出 |
| `inbox/` | memory 插件自动捕获的原始会话片段 | 由记忆 skill 消化后清空 |

## 规则

1. **标准流程只在 `runbooks/`**：worklog 发现可复现流程 → 写 runbook + worklog 留一行指针，不重复收录。
2. **自动捕获**：4 类场景由 `remember-*` skill 自动触发（见 `.opencode/skills/`）；插件把会话片段写入 `inbox/`。
3. **先去重再写**：同主题文档已存在 → 更新不新建。
4. **收尾动作**：写完任何记忆 → 更新本文件相关条目 + 清空已消化的 `inbox/` 片段。

## 索引

- runbooks：见 `runbooks/README.md`（若存在）或目录列表
- requirements 状态：见 `requirements/README.md`
- 最新决策：`decisions/`（按日期倒序）
- 最近工作：`worklog/`（按日期倒序）
```

- [ ] **Step 3: 提交**

```bash
git add .ai/README.md .ai/runbooks/.gitkeep .ai/archive/.gitkeep .ai/inbox/.gitkeep
git commit -m "feat: .ai 新增 runbooks/archive/inbox 目录与总索引 README"
```

---

### Task 2: runbooks 抽取（5 个标准流程）

**Files:**
- Create: `.ai/runbooks/hpcore-deploy.md`
- Create: `.ai/runbooks/web-cloudflare-deploy.md`
- Create: `.ai/runbooks/ios-device-install.md`
- Create: `.ai/runbooks/docker-local-build.md`
- Create: `.ai/runbooks/release-process.md`
- Modify: `.ai/worklog/2026-08-05-server-deployment.md`（末尾加指针行）
- Modify: `.ai/worklog/2026-08-05-release-pipeline.md`（末尾加指针行）
- Modify: `.ai/worklog/2026-08-06-v0.2.0-public-deployment.md`（末尾加指针行）
- Modify: `.ai/worklog/2026-08-06-web-cloudflare-deployment.md`（末尾加指针行）
- Modify: `.ai/worklog/2026-08-07-prod-cors-moment-diary-bugfixes.md`（末尾加指针行）
- Modify: `.ai/worklog/2026-08-08-audit-deploy.md`（末尾加指针行）
- Modify: `.ai/worklog/2026-08-08-moment-10000-limit-and-deploy.md`（末尾加指针行）
- Modify: `.ai/worklog/2026-08-05-event-module-implementation.md`（末尾加指针行）

**Interfaces:**
- Consumes: Task 1 的 `.ai/runbooks/` 目录、`.ai/README.md` 索引约定
- Produces: 5 个 runbook（Task 8 的 AGENTS.md 瘦身以它们为目标指针）

- [ ] **Step 1: 读来源 worklog 全文**

```bash
cat .ai/worklog/2026-08-05-server-deployment.md \
    .ai/worklog/2026-08-06-v0.2.0-public-deployment.md \
    .ai/worklog/2026-08-08-moment-10000-limit-and-deploy.md \
    .ai/worklog/2026-08-08-audit-deploy.md \
    .ai/worklog/2026-08-07-prod-cors-moment-diary-bugfixes.md \
    .ai/worklog/2026-08-06-web-cloudflare-deployment.md \
    .ai/worklog/2026-08-05-release-pipeline.md \
    .ai/worklog/2026-08-05-event-module-implementation.md
```

- [ ] **Step 2: 写 `.ai/runbooks/hpcore-deploy.md`**（唯一事实源，合并 4 个 worklog 的部署内容）

```markdown
# hpcore 生产服务器部署

**适用范围**：hpcore（Azure），`ssh -J hpazure hpcore`，`cd /srv/compose/serenique`。生产跑 Docker Hub `latest` / `:main` 镜像。

## 前置条件

- 镜像已由 GitHub Actions 构建并推送（main push → `:main`；tag → `latest`）
- `.env` 在服务器上，任何改动前先 `cp .env .env.bak.<时间戳>`

## 更新镜像（正常流程）

```sh
cd /srv/compose/serenique && docker compose pull && docker compose up -d
```

## 坑：镜像加速器缓存旧 tag（2026-08-08 实测）

hpcore 的 `/etc/docker/daemon.json` 配了镜像加速器，**对 `:main` tag 缓存旧镜像**：

1. `docker pull` 可能返回「Image is up to date」但拿到的是旧 digest。
2. **核对 digest**：`docker inspect zeroicey/serenique-api:main --format '{{.RepoDigests}}'` 与 CI 日志（`gh run view <run> --log | grep containerimage.digest`）一致才说明是新镜像。
3. 不一致 → 用 digest 精确拉取绕过 tag 缓存：

```sh
docker pull zeroicey/serenique-api@sha256:<digest>
docker tag zeroicey/serenique-api@sha256:<digest> zeroicey/serenique-api:latest
docker compose up -d --force-recreate api
```

4. `docker compose up -d` 输出「Container Running」而非「Recreated」= 容器没换镜像，必须 `--force-recreate`。
5. 业务侧验证：真实请求验证行为（如 PUT 超长文本应过校验返回 404 而非 500）。

## 回滚

- 服务器 `docker compose pull` 旧 `latest`，或拉 CI 构建的 `:main` 后 tag 成 `latest`。
- 改生产 `.env` 前先备份，改后 `docker compose up -d --no-deps api` 重建。

## 构建镜像注意

- 给 hpcore 构建镜像必须 `docker build --platform linux/amd64`（生产 amd64）；本机默认 arm64 会崩。
- 网络：本机 Docker Hub 直连超时，需加速器/代理；`docker manifest inspect` 不可用。
```

- [ ] **Step 3: 写 `.ai/runbooks/web-cloudflare-deploy.md`**

```markdown
# Web 前端部署（Cloudflare Pages）

**适用范围**：`apps/web` → `serenique-web.pages.dev`。生产注入 `VITE_API_BASE_URL=https://api.zeroicey.me`。

## 流程

```sh
# 1. 构建（dist 被 git 忽略，必须现场构建）
cd apps/web && VITE_API_BASE_URL=https://api.zeroicey.me bun run build

# 2. 部署
bunx wrangler pages deploy dist --project-name=serenique-web
```

## 坑

- **bunx wrangler 很慢**（30s–120s+）：Bash 里给足超时（≥300s）。
- **wrangler 4.x 必须先建项目**：`wrangler pages project create serenique-web --production-branch=main`（仅首次）。
- **SPA 路由兜底**：`apps/web/public/_redirects`（`/* /index.html 200`）会被复制进 dist。
- **中国网络 → Cloudflare 间歇 522**：重试即好，非部署缺陷。
- 账号：`zeroicey.hp@gmail.com`；Account ID `c41da26c0129fed3ea33ec684993ce0a`。
- 自定义域名 `serenique.0icey.icu` 被旧 Pages 项目占用（持续 502），复用需先下线旧项目。
```

- [ ] **Step 4: 写 `.ai/runbooks/ios-device-install.md`**

```markdown
# iOS 真机装机 / 重装

**适用范围**：iPhone 15 Pro（`hpcell`，设备 ID `C11AB076-C53F-5679-AE4E-FD16821ABCCC`），`apps/mobile`。

## 装机 / 重装固定流程

```sh
cd apps/mobile
flutter build ios --release --dart-define=API_BASE_URL=https://api.zeroicey.me
xcrun devicectl device install app --device C11AB076-C53F-5679-AE4E-FD16821ABCCC build/ios/iphoneos/Runner.app
```

## 坑

- **绝不用 debug 构建装真机**：iOS 禁 JIT，独立点击闪退。
- 免费签名 7 天过期，过期需重签重装。
```

- [ ] **Step 5: 写 `.ai/runbooks/docker-local-build.md`**

```markdown
# 本机 Docker 构建（API / MCP）

**坑**：构建容器无法直连 `registry.npmjs.org`（`ConnectionRefused`），`docker compose build` 会失败。

## 正确姿势

```sh
docker compose build --build-arg http_proxy=http://host.docker.internal:7897 \
  --build-arg https_proxy=http://host.docker.internal:7897 \
  --build-arg no_proxy=localhost,127.0.0.1 api mcp
```

`host.docker.internal:7897` 是宿主机本地 HTTP 代理（见本机 `http_proxy` 环境变量），端口变了就改。

- `docker compose up -d`（不 build）不需要代理参数。
- 手动构建：`docker build -t serenique-api -f services/api/Dockerfile .`（仓库根为构建上下文）。
```

- [ ] **Step 6: 写 `.ai/runbooks/release-process.md`**

```markdown
# 发布流程（tag → CI → 部署）

## 两步发布

```sh
# 1. 提交并推 main → docker-publish 出 zeroicey/serenique-{api,mcp}:main
git push origin main

# 2. 打 tag 推 → docker-publish 出版本+latest，release-cli 出 GitHub Release
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

## 流程细节

- `--version` 从 git tag 注入（`git describe --tags` / `GITHUB_REF_NAME`），**tag 是发布前提**。
- Docker Hub 命名空间 `zeroicey`；secrets：`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`（与 gh 的 GitHub 登录无关）。
- 镜像非 root（UID 10001）：新卷自动继承属主；旧卷需一次性 `docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`。
- 发布后服务器部署见 `hpcore-deploy.md`。
```

- [ ] **Step 7: 在 8 个来源 worklog 末尾各加一行指针**

每个文件末尾追加（空行分隔）：

```markdown
> 标准流程已抽到 `.ai/runbooks/<对应文件>`，本文件保留事件记录。
```

对应关系：`server-deployment` → `hpcore-deploy.md`；`release-pipeline` → `release-process.md`；`v0.2.0-public-deployment` → `release-process.md` + `hpcore-deploy.md`；`web-cloudflare-deployment` → `web-cloudflare-deploy.md`；`prod-cors-moment-diary-bugfixes` → `hpcore-deploy.md`；`audit-deploy` → `hpcore-deploy.md`；`moment-10000-limit-and-deploy` → `hpcore-deploy.md` + `ios-device-install.md`；`event-module-implementation` → `docker-local-build.md`。

- [ ] **Step 8: 更新 `.ai/README.md` 索引**（在「索引」小节加一行：`- runbooks：` 下列出 5 个文件名）

- [ ] **Step 9: 提交**

```bash
git add .ai/runbooks/ .ai/worklog/
git commit -m "feat: 从 worklog 抽取 5 个标准流程到 runbooks，原记录加指针"
```

---

### Task 3: archive 归档 + requirements 状态管理

**Files:**
- Move: `.ai/architecture/2026-08-05-web-moment-feature-plan.md` → `.ai/archive/`
- Move: `.ai/architecture/2026-08-06-web-event-feature-plan.md` → `.ai/archive/`
- Create: `.ai/requirements/README.md`
- Modify: `.ai/requirements/*.md`（9 个文件，头部补状态行）

**Interfaces:**
- Consumes: Task 1 的 `.ai/archive/` 目录
- Produces: `requirements/README.md` 状态总表（remember-requirement skill 的先去重依据之一）

- [ ] **Step 1: 移动 2 个 plan 到 archive**

```bash
git mv .ai/architecture/2026-08-05-web-moment-feature-plan.md .ai/archive/
git mv .ai/architecture/2026-08-06-web-event-feature-plan.md .ai/archive/
```

- [ ] **Step 2: 为 9 个 requirement 文件补状态行**

在 `---` 后的头部区加一行（各文件按实际状态；**audit-module 文档自述「实施未开始」已过期**——5 个 worklog 证明已实施）：
- `2026-08-05-diary-content-forms.md`、`2026-08-05-event-module.md`、`2026-08-05-moment-comments.md`、`2026-08-05-task-module.md`、`2026-08-06-auth.md`、`2026-08-08-audit-module.md` → `状态：✅已实施`
- `2026-08-05-moment-tags.md`（无实施记录）→ `状态：⏳待实施`
- `2026-08-08-push-module.md` → `状态：🔶设计中`（文档自述设计确认未实施，且无实施 worklog）

先逐个读文件确认状态再写，格式：`- 状态：✅已实施`（与现有 `- 日期：` 行同格式）。

- [ ] **Step 3: 写 `.ai/requirements/README.md` 状态总表**

```markdown
# 需求状态总表

| 文件 | 主题 | 状态 |
|------|------|------|
| `2026-08-05-diary-content-forms.md` | 日记内容形态 | ✅已实施 |
| `2026-08-05-event-module.md` | 事件模块 | ✅已实施 |
| `2026-08-05-moment-comments.md` | Moment 评论 | ✅已实施 |
| `2026-08-05-moment-tags.md` | Moment 标签 | ⏳待实施 |
| `2026-08-05-task-module.md` | 任务模块 | ✅已实施 |
| `2026-08-06-auth.md` | 认证 | ✅已实施 |
| `2026-08-08-audit-module.md` | 审计模块 | ✅已实施 |
| `2026-08-08-push-module.md` | 推送模块 | 🔶设计中 |

## 约定

- 新需求文件头部必须带状态行（✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决）。
- 实施完成后更新本表。状态变化时更新本表。
```

（表内容以 Step 2 实际确认的状态为准。已知：audit-module 文档状态过期——实际 ✅已实施；push-module 🔶设计中。）

- [ ] **Step 4: 提交**

```bash
git add .ai/archive/ .ai/requirements/
git commit -m "feat: 归档实施完的 feature plan，requirements 补状态管理"
```

---

### Task 4: 4 个 remember-* 记忆 skill

**Files:**
- Create: `.opencode/skills/remember-worklog/SKILL.md`
- Create: `.opencode/skills/remember-decision/SKILL.md`
- Create: `.opencode/skills/remember-requirement/SKILL.md`
- Create: `.opencode/skills/remember-runbook/SKILL.md`
- Create: `.opencode/skills/memory-consolidate/SKILL.md`

**Interfaces:**
- Consumes: Task 1-3 的目录结构（worklog/decisions/requirements/runbooks/archive/inbox）和 `.ai/README.md` 索引约定
- Produces: 5 个可被模型自动加载的 skill（Task 7 验证）

- [ ] **Step 1: 写 `.opencode/skills/remember-worklog/SKILL.md`**

```markdown
---
name: remember-worklog
description: 记录工作日志到 .ai/worklog/。Use when 完成实现、修复、部署、评估等实质工作并要收尾时；或会话中解决了新问题、踩了值得记住的坑时。会话结束时若当天无 worklog 必须触发。
---

# remember-worklog

把会话的实质工作写入 `.ai/worklog/`。这是 4 类自动捕获场景中的「①遇到新困难并自己解决」和「②完成珍贵流程」。

## 触发条件

- 完成实现 / 修复 / 部署 / 评估，准备收尾
- 会话中解决了新问题、踩了坑、发现了 pitfall
- 会话结束时当天尚无 worklog

## 先做：查重

- 读 `.ai/worklog/` 目录，同日期同主题已存在 → **更新该文件，不新建**。
- 更新 `.ai/README.md` 索引（若涉及新主题）。

## 模板

```markdown
# YYYY-MM-DD — <主题一句话>

<2-4 句背景：为什么做、解决了什么、用户反馈是什么>

## 改动（commit <sha>）

- **子系统**：具体改动（文件 + 行为），一行一条
- （多端同步时按 API / Web / CLI / 移动端分段）

## 验证

- 各端测试命令 + 结果（如 api `bun test` 122 pass）
- 生产/真机验证结果

## 坑 / 对下一次会话的提示

- 具体到命令级别，包含复现要点
- 标准流程类内容**不写这里**，走 remember-runbook 写 `.ai/runbooks/`，本文件留一行指针
```

## 收尾

- 若内容涉及标准流程（部署/上传/装机/构建）→ 调 remember-runbook
- 清空 `.ai/inbox/` 中已消化片段
```

- [ ] **Step 2: 写 `.opencode/skills/remember-decision/SKILL.md`**

```markdown
---
name: remember-decision
description: 保存技术/流程决策到 .ai/decisions/。Use when 选择了某方案、拒绝了某方案、改变了既有约定、评审后修正了标准时；出现「Why」层面的选择时触发。
---

# remember-decision

把决策写入 `.ai/decisions/`。这是自动捕获场景「④决策自动保存」。

## 触发条件

- 选择了某方案（含备选方案对比）
- 拒绝了某方案（记录为什么拒绝，防重复提议）
- 改变了既有约定 / 修正了之前的标准
- 评审/复盘后调整了流程

## 先做：查重

- 读 `.ai/decisions/` 目录，同主题已存在 → 更新或追加，不新建。

## 模板

```markdown
# <主题> 决策记录

日期: YYYY-MM-DD
适用范围: <受影响子系统>
前置记录: <相关文档，如无则删行>

## <决策编号> <一句话决策>

- **背景**：为什么出现这个决策点（问题/约束/教训）
- **决策**：结论
- **Why**：为什么这样选（含对比过的方案）
- **How to apply**：后续怎么做（具体到代码/流程层面）

## 明确拒绝 / 延期的决策

| 提议 | 结论 | 理由 |
|------|------|------|
```

## 收尾

- 更新 `.ai/README.md` 索引（决策区）
- 清空 `.ai/inbox/` 中已消化片段
```

- [ ] **Step 3: 写 `.opencode/skills/remember-requirement/SKILL.md`**

```markdown
---
name: remember-requirement
description: 捕获需求讨论到 .ai/requirements/。Use when 用户提出新功能、变更现有功能、讨论「想要什么」时；在讨论阶段就落盘，防止讨论内容丢失。
---

# remember-requirement

把需求讨论捕获到 `.ai/requirements/`。这是自动捕获场景「③跟 AI 讨论需求」。

## 触发条件

- 用户提出新功能 / 新模块
- 用户提出变更现有功能的行为
- 需求讨论持续超过几轮，结论开始成形

## 先做：查重

- 读 `.ai/requirements/README.md` 状态总表：同主题已存在 → 更新该文件（保持状态行）；不存在 → 新建。
- 已在讨论中的需求，**边讨论边更新**，最后一次性定型。

## 模板

```markdown
# <主题>需求文档

- 日期：YYYY-MM-DD
- 状态：🔶设计中（完成后改 ✅已实施 / 否决改 🪦已否决）
- 范围：<受影响子系统>
- 前置记录：<相关文档>

---

## 1. 背景与目标

<用户想要什么、为什么、使用场景>

## 2. 数据模型（设计方向）

<表/字段，或一行「无新表」>

## 3. 业务规则

<规则清单，含边界和上限>

## 4. API 路由（设计方向）

<方法/路径/说明表格；无则删节>

## 5. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
```

## 收尾

- 更新 `.ai/requirements/README.md` 状态总表
- 清空 `.ai/inbox/` 中已消化片段
```

- [ ] **Step 4: 写 `.opencode/skills/remember-runbook/SKILL.md`**

```markdown
---
name: remember-runbook
description: 保存标准操作流程到 .ai/runbooks/。Use when 走通了一个可复现的新流程（部署/上传/装机/构建/发布）、踩坑后找到修复流程、或发现 worklog 里重复出现流程描述时。
---

# remember-runbook

把标准流程写入 `.ai/runbooks/`。这是自动捕获场景「②完成珍贵流程」的沉淀去向。**规则：标准流程只在 runbooks/，worklog 不重复收录。**

## 触发条件

- 走通可复现的新流程（部署 / 上传 / 装机 / 构建 / 发布）
- 踩坑后找到修复方法，且该坑可能重演
- 多个 worklog 出现同一流程的重复描述（此时收敛成一个 runbook，worklog 留指针）

## 先做：查重

- 读 `.ai/runbooks/` 目录：同主题已存在 → **更新不新建**（唯一事实源）。
- 从 worklog 抽取时，原 worklog 末尾加一行 `> 标准流程已抽到 .ai/runbooks/<文件>`。

## 模板

```markdown
# <主题>（标准流程）

**适用范围**：<环境/机器/目录/命令前提>

## 前置条件

<账号、环境变量、镜像、依赖>

## 流程

```sh
<可复制粘贴的命令序列，带注释>
```

## 坑

- <踩过的坑 + 绕过方法，具体到命令>
```

## 收尾

- 更新 `.ai/README.md` 索引（runbooks 区）
- 清空 `.ai/inbox/` 中已消化片段
```

- [ ] **Step 5: 写 `.opencode/skills/memory-consolidate/SKILL.md`**

```markdown
---
name: memory-consolidate
description: 整理 .ai/inbox/ 的原始捕获片段。Use when 用户说「整理记忆」「整理 inbox」「消化 inbox」，或会话开始时有大量未消化 inbox 片段时。
---

# memory-consolidate

把 `.ai/inbox/` 中插件自动捕获的原始片段，整理进正式记忆位置。**手动触发**（不在自动捕获清单）。

## 流程

1. 读 `.ai/inbox/` 下所有文件，按日期分组。
2. 对每个片段：判断归属 → worklog（工作流水）/ requirements（需求）/ decisions（决策）/ runbooks（流程）。
3. 用对应 remember-* skill 的模板写入正式位置（先去重：同主题已存在则更新）。
4. 已消化的片段从 inbox 删除；inbox 为空则删除当日文件。
5. 更新 `.ai/README.md` 索引 + `requirements/README.md` 状态总表（若涉及）。
```

- [ ] **Step 6: 提交**

```bash
git add .opencode/skills/
git commit -m "feat: 新增 5 个记忆 skill（remember-* 自动捕获 + memory-consolidate 整理）"
```

---

### Task 5: memory 插件（事件驱动捕获）

**Files:**
- Create: `.opencode/plugin/memory.ts`
- Modify: `.opencode/package.json`（若需要 `devDependencies` 类型，保持现状即可——`@opencode-ai/plugin` 已在 dependencies）

**Interfaces:**
- Consumes: `.opencode/package.json` 的 `@opencode-ai/plugin` 1.18.15；Task 1 的 `.ai/inbox/` 目录
- Produces: `.ai/inbox/YYYY-MM-DD.md` 原始捕获片段（Task 4 的 memory-consolidate 消费）

- [ ] **Step 1: 写 `.opencode/plugin/memory.ts`**

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, appendFile } from "node:fs/promises"
import { join } from "node:path"

const INBOX_DIR = ".ai/inbox"

function todayFile(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return join(INBOX_DIR, `${y}-${m}-${day}.md`)
}

export function shouldCapture(text: string, hasEdits: boolean): boolean {
  return hasEdits || text.length >= 80
}

export function preview(text: string, max = 200): string {
  return text.slice(0, max).replace(/\n+/g, " ")
}

const CAPTURED_SESSIONS = new Set<string>()

export default (async ({ client }) => {
  return {
    event: async ({ event }: { event: any }) => {
      if (event.type !== "session.idle") return

      const sessionID: string | undefined = event.properties?.sessionID
      if (!sessionID || CAPTURED_SESSIONS.has(sessionID)) return
      CAPTURED_SESSIONS.add(sessionID)

      try {
        const sessionRes = await client.session.get({ path: { id: sessionID } })
        const session = sessionRes.data
        const msgsRes = await client.session.messages({
          path: { id: sessionID },
          query: { limit: 50 },
        })
        const entries = msgsRes.data ?? []
        const last = entries.reverse().find((m: any) => m.info?.role === "assistant")
        if (!last) return

        const text = (last.info.parts ?? [])
          .map((p: any) => (p.type === "text" ? p.text : ""))
          .join(" ")
          .trim()
        const hasEdits = (last.info.parts ?? []).some(
          (p: any) => p.type === "tool" && p.state?.status === "success",
        )
        if (!shouldCapture(text, hasEdits)) return

        const title = session?.title || sessionID.slice(0, 8)
        const now = new Date().toISOString()

        await mkdir(INBOX_DIR, { recursive: true })
        await appendFile(
          todayFile(),
          `## ${now} — 会话「${title}」\n- 会话 ID：\`${sessionID}\`\n- 预览：${preview(text)}\n\n`,
        )
      } catch (err) {
        console.error("[memory-plugin] capture failed:", err)
      }
    },
  }
}) satisfies Plugin
```

（`client.session.get` / `client.session.messages` 为 SDK 1.18.15 的生成方法：`session.get({ path: { id } })` → `{ data: Session }`；`session.messages({ path: { id }, query: { limit } })` → `{ data: Array<{ info: Message; parts: Part[] }> }`。`session.idle` 事件形状 `{ type, properties: { sessionID } }`。均已对照 `@opencode-ai/sdk` 1.18.15 的 `dist/gen/types.gen.d.ts` 核实。）

- [ ] **Step 2: 验证插件被识别且类型正确**

```bash
npx tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 .opencode/plugin/memory.ts
```

（若 tsc 不可用，用 `bunx tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 .opencode/plugin/memory.ts`。）

Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add .opencode/plugin/memory.ts
git commit -m "feat: memory 插件 — session.idle 自动捕获会话片段到 .ai/inbox"
```

---

### Task 6: 测试插件捕获逻辑（node 直接跑）

**Files:**
- Create: `/tmp/opencode/memory-plugin.test.mjs`（临时测试文件，不入库）

**Interfaces:**
- Consumes: Task 5 的插件代码
- Produces: 验证过的捕获过滤逻辑（无编辑且短文本不捕获 / 有编辑捕获 / 分组复用）

- [ ] **Step 1: 确认可测纯函数已导出**

`shouldCapture(text, hasEdits)` 和 `preview(text, max)` 已在 Task 5 的 `.opencode/plugin/memory.ts` 中定义并导出，无需改动。

- [ ] **Step 2: 写测试脚本 `/tmp/opencode/memory-plugin.test.mjs`**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { shouldCapture, preview } = require("/Users/zeroicey/workspace/projects/serenique/.opencode/plugin/memory.ts")

test("shouldCapture: 有编辑则捕获", () => {
  assert.equal(shouldCapture("一句话", true), true)
})
test("shouldCapture: 无编辑且短文本不捕获", () => {
  assert.equal(shouldCapture("好的", false), false)
})
test("shouldCapture: 无编辑但长文本捕获", () => {
  assert.equal(shouldCapture("a".repeat(80), false), true)
})
test("preview: 换行压成空格", () => {
  assert.equal(preview("line1\nline2"), "line1 line2")
})
test("preview: 超过 200 截断", () => {
  assert.equal(preview("a".repeat(300)).length, 200)
})
```

- [ ] **Step 3: 运行测试**

```bash
bun test /tmp/opencode/memory-plugin.test.mjs
```

Expected: 5 个测试全过。

- [ ] **Step 4: 提交**

```bash
git add .opencode/plugin/memory.ts
git commit -m "test: 插件捕获过滤逻辑补测试"
```

---

### Task 7: AGENTS.md 更新（纪律 + 指针 + 瘦身）

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1-3 的新目录与 runbooks 文件名
- Produces: 新会话的「项目记忆纪律」（Task 8 的验证依据）

- [ ] **Step 1: 更新「Project memory (`.ai/`)」小节**

原小节改为：

```markdown
## Project memory (`.ai/`)

The `.ai/` directory at the repo root is the project memory, treated as formal documentation. **It is an auto-capturing system**: skills + a plugin capture knowledge as work happens — read `.ai/README.md` first (index + rules), then the latest documents relevant to the change.

- `worklog/` — dated work logs: what was done, evaluated, and fixed each day, plus explicit pitfalls ("hints for the next session")
- `decisions/` — decision records with **Why** / **How to apply** rationale, including rejected/deferred options
- `requirements/` — requirement docs, each with a status line (✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决); status board in `requirements/README.md`
- `architecture/` — architecture design documents. Later documents supersede earlier ones
- `runbooks/` — **standard procedures live here only** (deploy / web upload / iOS install / docker build / release). Worklogs never duplicate a procedure — they link to the runbook
- `archive/` — dead documents (implemented plans)
- `inbox/` — raw session captures from the memory plugin; consumed by the memory skills and emptied

### 项目记忆纪律（自动捕获）

| 场景 | 动作 |
|------|------|
| 解决新问题 / 踩坑 | 写 worklog（remember-worklog） |
| 完成珍贵/难的需求或流程 | 写 worklog + 若可复现则写 runbook（remember-runbook） |
| 与用户讨论需求 | 边讨论边写 requirements（remember-requirement） |
| 做出决策 | 写 decisions（remember-decision） |

技能定义在 `.opencode/skills/remember-*`；插件自动把会话片段写进 `.ai/inbox/`，由 memory-consolidate 整理。标准流程只放 `.ai/runbooks/`，worklog 不重复收录（见各 runbook 及原 worklog 的指针行）。
```

- [ ] **Step 2: 瘦身——Docker 网络段改指针**

「Network note: pulling Go modules…」保留（Go 模块代理是 CLI 领域）。「Docker build network note」整段替换为：

```markdown
Docker build network note: build containers cannot reach `registry.npmjs.org` directly — inject the host proxy as build args. Full procedure: see `.ai/runbooks/docker-local-build.md`.
```

- [ ] **Step 3: 瘦身——发布流程段改指针**

「## Release / publishing process」小节保留标题，正文前 4 行命令保持，末尾加：

```markdown
Full release runbook (Docker Hub secrets, UID 10001 chown, version tags): see `.ai/runbooks/release-process.md`. Server-side deployment: see `.ai/runbooks/hpcore-deploy.md`.
```

- [ ] **Step 4: 自检**

```bash
grep -n "runbooks" AGENTS.md
```

Expected: 出现 `.ai/runbooks/` 至少 3 处（project memory 小节、docker build note、release 小节）。

- [ ] **Step 5: 提交**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md 更新记忆纪律 + 流程指向 runbooks"
```

---

### Task 8: 端到端验证

**Files:**
- 无新文件（只验证）

**Interfaces:**
- Consumes: 全部 Task 的产物

- [ ] **Step 1: 结构验证**

```bash
ls .ai/ && ls .ai/runbooks/ && ls .ai/archive/ && ls .ai/inbox/
```

Expected: README.md、5 个 runbook、2 个 archive plan、inbox 存在。

- [ ] **Step 2: skill 加载验证**

```bash
ls .opencode/skills/
```

Expected: `image-recognition`、`remember-worklog`、`remember-decision`、`remember-requirement`、`remember-runbook`、`memory-consolidate` 共 6 个目录，每个含 SKILL.md 且 frontmatter 有 name + description。

- [ ] **Step 3: 插件类型验证**

```bash
bunx tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 .opencode/plugin/memory.ts && bun test /tmp/opencode/memory-plugin.test.mjs
```

Expected: tsc 无错误；5 个测试通过。

- [ ] **Step 4: requirements 状态总表与文件一致性抽查**

```bash
grep -h "^\- 状态" .ai/requirements/*.md
```

Expected: 每个文件有且仅有一行状态，与 `requirements/README.md` 表格一致。

- [ ] **Step 5: 通知用户重启 opencode 并验证**

告知用户：重启 opencode 后，做一次文件编辑操作，然后检查 `.ai/inbox/` 是否出现当日捕获片段（真实 `session.idle` 事件触发验证）。这一步需要人工配合，不在本计划自动执行。

- [ ] **Step 6: 提交（如有遗漏修正）**

```bash
git status --porcelain
```

Expected: 工作区干净（无未提交改动）。

---

## 执行顺序说明

Task 1-3 相互独立但都写 `.ai/`（低冲突，可并行）；Task 4 依赖 Task 1-3 的目录结构；Task 5-6 依赖 Task 1 的 `inbox/`；Task 7 依赖 Task 1-3 的 runbooks 文件名；Task 8 是总验证。建议顺序执行 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8。
