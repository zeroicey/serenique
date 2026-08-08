# 生产公网入口：国内加速地址决策记录

日期: 2026-08-08
适用范围: 部署 / 客户端接入（CLI、移动端、Web）
前置记录: `.ai/runbooks/cn-access-hcyj.md`、`.ai/runbooks/hpcore-deploy.md`、`.ai/worklog/2026-08-08-cn-access-hcyj.md`

## D1 生产公网入口以 api.hcyj.xyz/serenique 为首选（国内）

- **背景**：serenique 部署在 Azure（hpcore），国内直连 api.zeroicey.me 实测 1.5–5.7s 飘忽；用户提供国内服务器 hcyj（阿里云）后，经 EasyTier 直连 hpcore 建立国内加速入口。国内直连 api.hcyj.xyz/serenique 稳定 55–80ms。
- **决策**：后续生产环境对国内用户的公网地址 = `https://api.hcyj.xyz/serenique`（HTTPS 证书由 hcyj Caddy 自动签发）。对外文档、CLI 默认配置、Web 端 baseURL 都以它为准；api.zeroicey.me 保留为境外/备用入口。
- **Why**：国内访问速度是实际体验瓶颈（差 20–50 倍）；EasyTier 是已存在的私有通道，无需额外成本；Caddy 托管证书免运维。域名复用 api.hcyj.xyz 加 `/serenique` 路径前缀是因为无泛解析域名、且该域名已解析到 hcyj（Caddy 同时服务小程序后端，默认 handle 不能被占用）。
- **How to apply**：
  - CLI：`SERENIQUE_BASEURL=https://api.hcyj.xyz/serenique`，token 不变（AUTH_TOKEN 是服务端共享秘密，与入口无关）
  - 更新 CLI 默认配置/文档时以该地址为生产默认值
  - hpcore 上测试该域名必须 `curl --resolve api.hcyj.xyz:443:10.126.126.7`（本机 DNS 会解析到 SakuraiTunnel 虚拟 IP 导致超时）
  - 本机实测延迟必须 `curl --noproxy '*'`（curl 默认走代理 7897）

## 明确拒绝 / 延期的决策

| 提议 | 结论 | 理由 |
|------|------|------|
| 独立子域（如 api-cn.zeroicey.me 或 serenique.hcyj.xyz） | 延期 | 需额外 DNS 记录 + Cloudflare 配置；当前域名已就绪，先跑通再评估 |
| 复用 api.hcyj.xyz 默认 handle 根路径 | 拒绝 | 默认 handle 已被小程序后端占用（172.17.0.1:3000），只能新增路径前缀 |
| 在 hpcore/hpazure 上开端口直连 | 拒绝 | 国内→Azure 线路本身慢，问题在最后一公里，加端口无济于事 |
