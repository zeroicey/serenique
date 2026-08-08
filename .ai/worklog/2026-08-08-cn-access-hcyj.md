# 2026-08-08 — 国内加速入口：hcyj Caddy 反代 hpcore（EasyTier 直连）

国内访问 Azure 上的 serenique 很慢（直连 1.5–5.7s 飘忽），用户提供国内服务器 hcyj（阿里云 8.148.233.134）做加速入口。勘察发现 hpcore 与 hcyj 同在 EasyTier hpnet 网络（10.126.126.2 / 10.126.126.7），API 容器直接绑定 `10.126.126.2:3000`，hcyj→hpcore 11ms 直连天然可用。在 hcyj 的 Caddy（api.hcyj.xyz）上新增 `/serenique/*` 前缀反代，国内访问稳定 ~60ms。

## 改动

- **hcyj Caddyfile**（`/root/hcyj/caddy/Caddyfile`，docker 挂载）：
  - 新增 `handle_path /serenique/*` → `reverse_proxy 10.126.126.2:3000`，transport 带 `keepalive off`（照抄 hpazure，EasyTier 隧道同样会被 Bun API 重置连接）
  - 删除死配置 `handle_path /yeciorez*` → `100.103.89.5:50103`（Tailscale 遗留，目标 ping 不通）
  - 小程序后端默认 `handle`（→172.17.0.1:3000）保持不动
  - 流程：备份 `Caddyfile.bak.<ts>` → `docker exec caddy caddy validate` → `caddy reload`（无需重启容器）
- 未改动 hpcore / hpazure 任何配置

## 验证

- 本机（国内网络，`curl --noproxy '*'`）：
  - `https://api.hcyj.xyz/serenique/health` 200，稳定 55–80ms（旧链路 api.zeroicey.me 直连 1.5/5.7/2.7s）
  - 无 token 请求 `/serenique/api/diaries` → 401（认证生效）
  - 小程序默认路径 `/` → 200（未破坏）
- hpcore 侧（经 EasyTier 回环 + 生产 token）：`/serenique/api/diaries` 返回真实数据 ✅

## 坑 / 对下一次会话的提示

- **本机 curl 默认走代理 7897**：测国内真实延迟必须 `curl --noproxy '*'`，否则两个链路都测的是代理延迟
- hpcore 上访问 `api.hcyj.xyz` 会解析到 SakuraiTunnel 虚拟 IP（198.18.x.x）直接超时——hpcore 上测试要用 `curl --resolve api.hcyj.xyz:443:<ip>`
- hpcore 直连阿里云公网 IP 也超时（Azure→阿里云线路），只有 EasyTier 内部路径通
- `/serenique` 前缀是 `handle_path`，会剥离前缀再转给上游，API 内部路径无需改动
- CLI/客户端接入：`SERENIQUE_BASEURL=https://api.hcyj.xyz/serenique` + 原 token 即可（国内入口不换 token，AUTH_TOKEN 是服务端共享秘密）

> 标准流程已抽到 `.ai/runbooks/cn-access-hcyj.md`
