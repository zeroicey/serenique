# Moment 位置信息需求文档

- 日期：2026-08-08
- 状态：✅已实施（API + CLI；MCP 已停更不涉及）
- 范围：services/api（moment 模块）、apps/cli
- 前置记录：无

---

## 1. 背景与目标

用户想要「微信朋友圈式」的发布位置功能：前端可选地获取并选择附近位置，随 moment 一起发布。位置获取/选择是前端行为，后端只负责存储和透传。

兼容性要求：功能完全可选，任一客户端未更新也能正常使用（旧客户端不传位置 = null）。

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

## 6. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 字段形态 | 结构化对象 jsonb（name + latitude + longitude，均可选），对齐微信（名字+坐标可看地图） |
| 2 | 编辑接口语义 | 可编辑+可清除：PUT 三态（缺省/null/对象） |
| 3 | 兼容性 | 全部可选字段 + nullable 列，旧客户端零影响 |
