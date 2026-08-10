# Moment 位置信息需求文档

- 日期：2026-08-08（08-10 更新：补充前端展示 + POI 选点闭环）
- 状态：✅已实施（API + CLI + Web 展示与选点；MCP 已停更不涉及；Flutter 端 P2 待排期）
- 范围：services/api（moment 模块 + location 代理模块）、apps/cli、apps/web
- 前置记录：无

---

## 1. 背景与目标

用户想要「微信朋友圈式」的发布位置功能：前端可选地获取并选择附近位置，随 moment 一起发布。位置获取/选择是前端行为，后端只负责存储和透传。

兼容性要求：功能完全可选，任一客户端未更新也能正常使用（旧客户端不传位置 = null）。

**08-10 补充（前端闭环）**：创建 moment 时要能"选位置"（朋友圈式选点页：附近位置列表 + 搜索），创建后列表/预览显示位置。选点依赖第三方 LBS（高德，见「已定决策」#4-#6）。

## 2. 数据模型

`moments` 表新增一列（jsonb，nullable，default NULL）：

```ts
location: jsonb("location")
```

内部形态（宽松通用，子字段均可选）：

```ts
// MomentLocation
{ name?: string, latitude?: number, longitude?: number }
```

- `name` ≤ 128 字符（位置名，如「北京·三里屯」）
- `latitude` 范围 -90..90
- `longitude` 范围 -180..180
- 约束：对象内至少一个字段；location 整体可缺省/null

与 event 模块的 `location`（纯文本）不同：moment 用结构化对象，保留坐标以支持前端地图展示，且子字段都宽松可选，前端想存什么存什么。

## 3. 业务规则

- 创建：`location` 可选，缺省 = null（旧客户端完全不受影响）
- 更新（PUT，三态语义）：
  - 缺省 = 保持原值不变（现有字段兼容旧客户端，旧客户端 PUT 只带 text 不会清掉位置）
  - `null` = 清除位置
  - 对象 = 设置/覆盖
- 响应 `MomentEntry` 增加 `location: MomentLocation | null`，列表/详情/创建/更新一致
- 不校验坐标与位置名的一致性（如坐标是否为 name 对应地点）——后端只做形状和范围校验

## 4. API 路由

无新路由。仅现有 `POST /api/moments`、`PUT /api/moments/:id` 请求体与所有 moment 响应增加 `location` 字段。

## 5. CLI 变更

- `moment create` 新增 `--location "名称"`（可选 `--lat` / `--lng`）
- `moment edit` 新增 `--location "名称"`（设置）与 `--no-location`（清除），沿用 confirm 流程
- `MomentEntry` 结构体 json tag 同步（`location` 用指针，兼容 `location: null` 与字段缺失）
- 表格输出增加位置列

## 6. Web 前端（08-10 补充）

### 6.1 展示（列表）

- `MomentEntry` 增加 `location: MomentLocation | null`（对齐后端 `moment.types.ts`）
- 列表卡片在附件网格与元信息行之间显示位置行（复用 event 模块 `event-item.tsx` 的 MapPin 样式：`MapPin` 图标 + text-xs muted 文本）
- 显示规则：`name` 优先；无 `name` 显示坐标文本（`lat, lng`）；点击 → 高德深链 `https://uri.amap.com/marker?position=lng,lat&name=...&callnative=1`（免 key、GCJ-02 直接可用）

### 6.2 创建（选点，朋友圈式）

- 创建页底部加「所在位置」行（默认"不显示位置"）→ 点击打开选点弹窗：
  - 自动定位（浏览器 `navigator.geolocation`，WGS-84）→ 调 `GET /api/location/nearby` → 附近位置列表（按距离排序，显示距离）
  - 顶部搜索框（debounce）→ 调 `GET /api/location/search`（inputtips）
  - 定位失败 → 提示"无法获取当前位置"，可手动搜索（搜索可不带坐标）
  - 选中 → 返回创建页显示「📍 名称」，可清除；提交时 `location: { name, latitude, longitude }`
- 后端未配置 `AMAP_KEY` 时：`GET /api/location/config` 返回 `{ enabled: false }`，Web 隐藏选点入口（功能可选，不影响其他功能）

## 7. API 路由（location 代理模块，08-10 补充）

无新表。`services/api` 新增 `location` 模块，代理高德 Web 服务 API（Key 只放服务端 env `AMAP_KEY`）：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/location/config` | `{ enabled: boolean }`（AMAP_KEY 未配置 → false） |
| GET | `/api/location/nearby` | 附近位置：`lng`/`lat`（设备 WGS-84）/`radius`（默认 3000）/`keyword?`；服务端转 GCJ-02 后调高德 `place/around`；返回 `{ items: [{ name, latitude, longitude, address?, distance? }] }` |
| GET | `/api/location/search` | 关键字搜索：`keyword`/`lng`/`lat`?；高德 `inputtips`（datatype=poi）；返回同 `{ items }` |

- 坐标转换：服务端内嵌 WGS-84→GCJ-02 纯函数（coordtransform 算法，零 API 调用）
- 缓存：10 分钟级 LRU（按请求参数 hash），压低配额消耗
- 配额：高德个人认证月 5,000 次（基础搜索服务），个人自用足够

## 8. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 字段形态 | 结构化对象 jsonb（name + latitude + longitude，均可选），对齐微信（名字+坐标可看地图） |
| 2 | 编辑接口语义 | 可编辑+可清除：PUT 三态（缺省/null/对象） |
| 3 | 兼容性 | 全部可选字段 + nullable 列，旧客户端零影响 |
| 4 | POI 服务选型 | **高德为主**（官方 Flutter 插件含 POI 搜索；个人超配额可购买）；腾讯留作 provider 层备选（日配额大但 Flutter 需自封装、个人不能买超量） |
| 5 | 坐标系 | 统一存 **GCJ-02**（设备 WGS-84 由服务端转换后再搜索；高德接口经度,纬度、腾讯纬度,经度，provider 层分别处理） |
| 6 | 展示准确度 | name 优先（用户确认过的名字天然准确）；坐标兜底 + 深链；**展示时不做逆地理编码**（官方定性为估计值） |
| 7 | Key 管理 | `AMAP_KEY` 只放服务端 env；Web/移动端统一走后端代理接口 |
