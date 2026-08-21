# R2 存储：部署 / 迁移 / 切换 / 回滚

**适用范围**：Serenique blob（Moment 附件）存储在 Cloudflare R2 bucket `serenique`，私有桶 + Worker 网关 `s3.0icey.icu` 签名直链（读）/ 签名直传（写）。需求与实现：`.ai/requirements/2026-08-20-object-storage-r2.md`（✅已实施）、`.ai/worklog/2026-08-21.md`。涉及：`infra/r2-gateway/`（Worker）、`services/api/src/shared/storage.ts`（local|r2 双后端）、`scripts/migrate-blobs-to-r2.ts`（迁移）、hpcore 生产 .env。

## 架构速览

```
浏览器/移动端 ──读: GET s3.0icey.icu/{key}?e&s（HMAC v1 签名）───  ▶ Worker ──▶ R2 serenique
            ──写: PUT s3.0icey.icu/{key}?e&s（HMAC up 签名含 size）─── ▶ Worker ──▶ R2（写）
API（hpcore 容器）── 仅签发签名凭据 + DB 元数据，零 R2 网络（Bun 无法经代理访问 R2，见 worklog）
```

- 签名域：读 `v1:{path}:{expires}`；写 `up:{path}:{expires}:{contentLength}`（hex）。API 侧：`signR2Access` / `signR2Put`（blob.domain）；Worker 侧：`validSig`（gateway.js）。改动一侧必须同步另一侧（固定向量单测 `blob.service.test.ts` 锁定）。
- 上传：`POST /api/blobs/upload-url`（签发 PUT 凭据）→ 客户端 PUT → `POST /api/blobs/confirm`（去重落库）。Web 端 `features/blob/api.ts` 的 uploadBlob；移动端 `moment_api.uploadBlob`；local 后端 upload-url 返回 400 → 客户端回退旧 multipart `POST /api/blobs/upload`。

## 环境变量（生产 .env）

```
STORAGE_BACKEND=r2                    # local | r2（切换关键开关；回滚改回 local）
R2_PUBLIC_HOST=https://s3.0icey.icu   # 签名直链/直传 host（前端不在 R2 时 vulnerability）
R2_ACCOUNT_ID=<account-id>
R2_ACCESS_KEY_ID=<ak>                 # dashboard R2 → 管理 R2 API 令牌 创建（对象读写）
R2_SECRET_ACCESS_KEY=<sk>
R2_BUCKET=serenique
R2_ACCESS_SIGNING_SECRET=<≥32字符>     # 必须与 Worker R2_ACCESS_SIGNING_SECRET 完全一致
```

## 部署 Worker（改 gateway.js 后）

```sh
cd infra/r2-gateway
bunx wrangler deploy                      # 需 wrangler OAuth（本机已登录）
# secret 变更（值必须与生产 API env 一致）：
echo '<secret>' | bunx wrangler secret put R2_ACCESS_SIGNING_SECRET
```

验证（本机签名后请求，参考 worklog）：无签名 403、有效签名读 200 / Range 206、PUT 篡改 size 403、PUT 有效 200 且读回一致。

## 生产切换 / 回滚

```sh
# hpcore
cd /srv/compose/serenique && cp .env .env.bak.$(date +%s)
# 切 r2：sed -i 's/^STORAGE_BACKEND=.*/STORAGE_BACKEND=r2/' .env
# 回滚：                                         .../STORAGE_BACKEND=local/  （体积保留，下一步骤一致）
docker compose up -d --force-recreate api
```

- ⚠️ **回滚到 local 时**：`createAccessLink` 直链分支已绑定 `STORAGE_BACKEND==='r2'`（D-031），自动回退 API 代理链接——无需额外操作。
- ⚠️ 镜像更新用 digest 精确拉取绕过加速器缓存：
  `docker pull zeroicey/serenique-api@sha256:<CI digest>`（CI 日志 containerimage.digest）→ `docker tag ... latest` → `--force-recreate`。

## 数据迁移（volume → R2）

脚本幂等（List 预载 + 跳过已存在），可在任意机器跑（本机直连 R2 最快）：

```sh
# 服务器打包 volume 拉回本机（无 rsync 时）：
ssh -J hpazure hpcore 'docker run --rm -v serenique_serenique-blob-data:/data/blobs alpine tar -C /data/blobs -cf - .' > blobs.tar
mkdir -p /tmp/migrate && tar -xf blobs.tar -C /tmp/migrate/
cd services/api
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=serenique \
  BLOB_ROOT=/tmp/migrate bun scripts/migrate-blobs-to-r2.ts [--dry-run]
```

- mimeType 优先查 DB（需 DATABASE_URL），缺省回退扩展名推断。
- ⚠️ Body 用 `new Uint8Array(await file.arrayBuffer())`（Bun.file 流式会让 SDK hash 校验失败）。

## 常用验证（本机）

```sh
# R2 对象数
bun -e "ListObjectsV2..."   # 或用 scripts/_count*.ts 形式
# 签名直链（v1）：
HMAC-SHA256(secret, `v1:<path>:<expires>`) hex → GET https://s3.0icey.icu/<path>?e=<expires>&s=<hex>
# 生产端到端日志：docker logs serenique-api | grep upload-url/confirm
```

## 相关决策

D-029 架构定稿（Worker 网关私桶 + 自签直链）；D-030 原「代理前提」已被 D-032 取代（Bun 无法经 CONNECT 代理访问 R2 → 客户端直传）；D-031 能力启用必须绑定生效后端开关。
