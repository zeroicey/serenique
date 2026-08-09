# 移除公开首次注册 + 生产部署（v0.5.1 轮）

- 日期：2026-08-09
- 相关：`.ai/requirements/2026-08-09-passkey-auth.md`（决策⑨）、`.ai/runbooks/hpcore-deploy.md`（全新安装流程）

## 做了什么

1. **API**（`e9e0195`）：注册门禁从 users 计数改为 **passkey_credentials 计数**——凭证=0 + SETUP_TOKEN 才允许引导 ceremony；凭证≥1 仅登录态加设备；`register/start` 移除 `userInfo`；新增 `scripts/bootstrap-user.ts`（幂等建用户行）；启动 fail-closed：认证启用且 users 空表 → 拒绝启动（提示跑引导脚本）。`tsconfig` include scripts，测试 252 全绿。
2. **Web**（`5571a16` + `b311977`）：登录页删注册表单/探测逻辑，只留通行密钥登录；新增隐藏 `/setup?setupToken=` 页创建首个凭证（无导航入口）；发现并修复 `api/client.ts` `throwHttpErrors:false` 导致错误态失效的契约坑。167 测试全绿。
3. **生产部署**（本日志）：push main（d00396a）→ CI digest `9b6e406e…` → hpcore 按 runbook 的镜像加速器坑处理（tag 缓存旧 digest 0c513c…，改 digest 精确拉取）→ force-recreate → 双链路 health ok → 迁移无（无 schema 变更）→ Cloudflare Pages 部署（25 files）→ `/moment` `/setup` 200。

## 生产验证结果

- 无认证 `GET /api/auth/me` → 401「未认证或登录已过期」✅
- 凭证≥1 时 `register/start` 带错 token → 401「请先登录后再添加新的登录凭证」✅（公开首次注册已死）
- 审计日志核对（用户提问）：`auth.register`（08-09 08:09, 用户 IP）= 用户首次 passkey 创建；`auth.login_failed`（08:06）= 注册前无凭证的登录尝试，符合预期；外部扫描探测（23.27.x/GCP）全部 401 拦截；无 error/5xx。
- DB 状态：users=1 / passkey_credentials=1 / api_tokens=0，与用户操作完全吻合。

## 坑

- **镜像加速器缓存旧 tag 再次踩中**（runbook 已有记录）：`docker pull :main` 返回 up-to-date 但 digest 还是旧的。必须从 CI 日志取 digest 精确拉取。gh 日志里 digest 出现在 `Build & push` 步骤的 `##[group]Digest` 下（grep `containerimage.digest` 拿不到，直接 grep `"digest"` 后取 sha256）。
- 本机直连 Azure 公网 curl 超时（120s+），走 api.hcyj.xyz 国内入口正常——已知线路问题。
- `.ai/requirements/2026-08-09-ai-agent-module.md` 是另一会话 WIP，未纳入本次提交。
