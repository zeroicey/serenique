# 2026-08-10 — Moment 位置功能前端闭环 P1（朋友圈式选点 + 展示）

用户要求补齐 moment 位置的「朋友圈式」前端闭环：创建 moment 时可选位置（附近位置列表 + 搜索），创建后列表显示位置。调研结论：后端存储（`moments.location` jsonb，08-08 已实施）与 CLI 早已支持，缺的是 Web/Flutter 端消费 + POI 选点链路。选点必须依赖第三方 LBS，经调研（高德 vs 腾讯官方文档）选定**高德为主**：官方 Flutter 插件含 POI 搜索、个人超配额可购买；腾讯日配额大但 Flutter 需自封装且个人不能买超量。坐标系统一 GCJ-02（设备 WGS-84 服务端转换）；展示 name 优先、不做展示时逆地理编码（官方定性为估计值）；Apple 免费签名即可用定位（Core Location 非受管能力，无需 $99）。

## 改动（commit 待提交）

- **API（services/api/src/modules/location/，新模块，高德 Web 服务代理）**：
  - `location.types.ts`：`NearbyQuerySchema`（lng/lat 范围、radius 1..50000 默认 3000、keyword ≤50）/ `SearchQuerySchema`（keyword 1..50，lng/lat 成对 refine）；`z.coerce` 兼容字符串 query 与数字直调；响应 `{ items: [{ name, latitude, longitude, address?, distance? }] }` + `config: { enabled }`
  - `location.domain.ts`：纯函数 `wgs84ToGcj02`（coordtransform 算法、outOfChina 守卫、零依赖）+ 缓存 key 序列化
  - `location.service.ts`：`locationService` 单例；WGS-84→GCJ-02 后调高德 `place/around`（经度,纬度序、sortrule=distance、offset=20）与 `inputtips`（datatype=poi）；5s AbortSignal 超时；10 分钟 LRU 缓存（成功与高德业务错误都缓存，网络失败不缓存）；`AMAP_KEY` 未配置 → 503 SERVICE_UNAVAILABLE「位置服务未配置」
  - `location.mappers.ts`：高德响应→items 映射（GCJ-02 坐标直接透传，非法坐标 POI 跳过）
  - 路由：`GET /api/location/config|nearby|search`；`app.ts` 挂载、`env.ts` 加可选 `AMAP_KEY`（非 fail-closed）、`exports.ts` 导出、`shared/errors.ts` 加 `SERVICE_UNAVAILABLE`、`.env.example` 文档化
- **Web（apps/web）**：
  - `features/moment/api.ts`：`MomentLocation` 类型 + `MomentEntry.location` + `CreateMomentInput.location?`；`schemas.ts`：`momentLocationSchema`（name ≤128/lat/lng，refine 至少一字段）+ 创建 schema 接入
  - `features/location/`（新平铺 feature）：`api.ts`（config/nearby/search 走 `unwrap` 解包）、`queries.ts`（`useLocationConfig` 5min stale、nearby/search 按 open+坐标/关键词动态启用）、`format.ts` 纯函数（`formatLocationLabel` name 优先→坐标 toFixed(4)、`locationAmapUrl` position=经度,纬度、`formatDistance` ≥1000→km）、`use-debounced-value.ts` 300ms 防抖
  - `moment-location-picker.tsx`：朋友圈式选点 Dialog——打开时 `navigator.geolocation`（8s 超时，失败提示「无法获取当前位置，可直接搜索」不阻塞）→ 附近列表（name+距离）；搜索框防抖；空输入回附近；选中回传 GCJ-02 并关闭
  - `moment-create-page.tsx`：`useLocationConfig` enabled=false 时隐藏「所在位置」入口；选中显示 📍+名称+×清除；提交带 `location`
  - `moment-item.tsx`：附件网格与元信息行之间的位置行（MapPin 13 + text-xs muted，对齐 event-item）；有坐标整行 `<a target="_blank">` 打开高德深链
- **需求文档**：`.ai/requirements/2026-08-08-moment-location.md` 补 6/7/8 节（Web 前端、location 代理路由、已定决策 #4-#7）

## 验证

- API：`bun run typecheck` 干净；`bun test src/modules/location/` 24 pass（坐标转换含天安门 WGS-84→GCJ-02 ±0.0001 + 规范向量 bit-exact）；全量 `bun test` 312 pass / 120 skip（DB 集成 gated by RUN_DB_TESTS）
- Web：`bunx tsc --noEmit` 干净；`bunx vitest run` 46 文件 224 用例全过（新增 16 用例：位置行渲染/深链 href、选点弹窗 geo 失败/防抖/清除、schema 校验）
- 双端契约已互相核对：config/nearby/search 参数与 items 形状完全一致，无偏差
- 未做生产联调（本地无 AMAP_KEY；未配置时接口 503、前端隐藏入口，均按设计降级）

## 坑 / 对下一次会话的提示

- **`bun test`（apps/web）走 Bun 自带 runner，不支持 `vi.hoisted`** → Web 测试正确入口是 `bunx vitest run`（agent 踩到，已用 vitest 跑全绿）
- **高德接口经纬度顺序是 `经度,纬度`**（location 参数与返回字符串都是）；腾讯是 `纬度,经度`。若日后切腾讯 provider，参数拼接与解析都要换序
- **高德返回坐标是 GCJ-02**，与浏览器 geolocation 的 WGS-84 偏差几百米；本实现由服务端统一转换，前端透传即可。已存数据若混入 WGS-84 会在地图上偏移——选点写入的坐标都是 GCJ-02，CLI 手填的坐标（--lat/--lng）约定也是 GCJ-02
- **coordtransform 天安门参考向量**：规范算法输出为 (116.397516, 39.907618)（prompt 里给的 39.90923 是网上不准确的二手值，测试以规范算法 bit-exact 为准）
- `AMAP_KEY` 是可选 env（非 fail-closed），生产要启用位置功能需在高德开放平台做**个人实名认证**（未认证配额为 0）——见需求文档第 8 节决策 #4
- 展示时**不做逆地理编码**：Google 官方明说 reverse geocoding 是 estimate；name 是选点时用户确认过的，天然准确
