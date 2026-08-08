# 2026-08-08 — 生产 API 上线（moment 位置功能 + 移动端批次）

把本地 main（含 moment 位置功能 + 一批移动端提交，28 个 commit）发布到生产 hpcore。生产此前跑旧镜像：位置字段被旧 zod 静默丢弃（创建响应无 `location` 键）、DB 无 `location` 列。

## 流程（commit <8298b80 推送>

1. `git push origin main` → docker-publish CI 构建 `zeroicey/serenique-api:main`（工作流已只构建 api）
2. hpcore：`docker pull zeroicey/serenique-api:main` → **核对 digest 与 CI 一致**（`gh run view <run> --log | grep containerimage.digest`，本次 `8eb8bed6...`，镜像加速器 tag 缓存坑）→ `docker tag ...:latest` → `docker compose up -d --force-recreate api`
3. 手动迁移 0011：stdin 直灌 `ALTER TABLE moments ADD COLUMN location jsonb;` + `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)`（hash=sha256(整文件)，when=journal 值 1786201871105）
4. 容器 `healthy / running`

## 验证（经国内入口 api.hcyj.xyz/serenique，Bearer token）

- 创建带位置 moment → location 完整往返（旧镜像会静默丢弃）
- 文本-only PUT 保留位置 → null 清除 → 均符合契约
- 删除 204、健康检查正常

## 坑 / 对下一次会话的提示

- **hpcore 生产跑 `latest`，CI 只推 `:main`**：非 tag 发布的部署 = 服务器手动 `docker tag :main → :latest` + `--force-recreate`（runbook 回滚节同法）。本次未打 tag（v0.4.0 之后仍无版本 tag），`latest` 与 `:main` 同 digest
- **本机工作区仍有未提交改动**（docker-compose.yml 删除、AGENTS.md/.env.example、移动端 pubspec 等，属「compose 退役 + env 核对」会话的收尾）：本次 push 未包含它们，docker-publish 镜像构建不受影响（只涉及 docs/移动端），但注意别把别人的未提交文件混进后续 commit
- prod 迁移每次要手动 INSERT `__drizzle_migrations` 记录（服务器无 bun/npm，`docker exec -i postgres psql` + stdin 最稳）
