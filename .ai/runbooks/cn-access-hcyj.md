# 国内加速入口（hcyj 反代 hpcore）

**适用范围**：国内服务器 `hcyj`（阿里云 8.148.233.134，Ubuntu，root）。入口：`ssh hcyj`。目的：给 Azure 上的 hpcore serenique 提供国内快速 HTTPS 入口。

## 链路拓扑

```
国内客户端 → https://api.hcyj.xyz/serenique/* (hcyj Caddy:443)
           → EasyTier hpnet 直连 10.126.126.2:3000 → hpcore serenique-api 容器
```

- hcyj EasyTier IP：`10.126.126.7`；hpcore：`10.126.126.2`（serenique-api 容器直接绑定该 IP:3000）
- 互通延迟 ~11ms，hpcore 侧无需任何配置

## 前置条件

- hcyj 上 Caddy 跑在 docker 容器里（`/root/hcyj/caddy/Caddyfile` 挂载为 `/etc/caddy/Caddyfile`），443 对外
- hpcore 的 easytier 服务在跑（systemd `easytier-hpnet-client`）
- 无泛解析：api.hcyj.xyz 已解析到 8.148.233.134（如换新域需先加 DNS A 记录）

## 流程

1. 备份 + 改配置：

```sh
ssh hcyj
cp /root/hcyj/caddy/Caddyfile /root/hcyj/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
# 编辑 Caddyfile，新增站点块内 handle_path（handle_path 自动剥离前缀）：
#   handle_path /serenique/* {
#       reverse_proxy 10.126.126.2:3000 {
#           header_up Host {host}
#           header_up X-Real-IP {remote}
#           header_up X-Forwarded-For {remote}
#           header_up X-Forwarded-Proto {scheme}
#           transport http {
#               dial_timeout 3s
#               response_header_timeout 30s
#               keepalive off
#           }
#       }
#   }
```

2. 校验 + 热加载（无需重启容器）：

```sh
docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

3. 验证：

```sh
curl -s https://api.hcyj.xyz/serenique/health   # 期望 {"success":true,"message":"服务运行中",...}
# 小程序后端未受影响：
curl -s -o /dev/null -w '%{http_code}' https://api.hcyj.xyz/   # 200
```

## 客户端接入

- CLI：`SERENIQUE_BASEURL=https://api.hcyj.xyz/serenique` + 原 `SERENIQUE_TOKEN`（token 是服务端共享秘密，不换）
- 移动端：`--dart-define=API_BASE_URL=https://api.hcyj.xyz/serenique`
- 本机测国内真实延迟必须 `curl --noproxy '*'`（本机 curl 默认走代理 7897，测的是代理延迟）

## 路由反代适配（重要）

`handle_path /serenique/*` 会**剥离前缀**再转发，后端看到的请求 URL 不含 `/serenique`。因此：

- **签名链接（`POST /api/blobs/:id/access-link`）返回的 `url` 字段不能用**——它是后端用自己看到的 origin 拼的绝对 URL（`https://api.hcyj.xyz/api/blobs/...`，缺前缀）→ 请求落到 Caddy 默认 handle（小程序后端）→ 404。
- **正确做法**：客户端用返回的**相对 `path`** 拼自己的 baseUrl：`'${apiBase}$path'`（Web `resolveApiPath`、移动端 `createBlobAccessLink` 均如此）。无前缀入口（api.zeroicey.me）同样正确。
- 请求路径 / 回退直链无需适配（客户端 baseUrl 天然带前缀）。

## 坑

- **Caddy 上游必须 `keepalive off`**：EasyTier 隧道和 frp 同理，连接被 Bun API 重置后 Go transport 重试会造成偶发慢请求（照抄 hpazure 的写法）
- hpcore 上访问 api.hcyj.xyz 解析到 SakuraiTunnel 虚拟 IP（198.18.x.x）会超时；hpcore→阿里云公网 IP 直连也超时（线路问题）——hpcore 上测试一律 `curl --resolve api.hcyj.xyz:443:10.126.126.7` 走 EasyTier
- `/yeciorez*` → `100.103.89.5:50103` 是 Tailscale 遗留死配置，已删，勿恢复
- api.hcyj.xyz 默认 handle 属于小程序后端（172.17.0.1:3000），新增 serenique 只允许用路径前缀，不能抢默认 handle
