import { z } from "zod";

// ---------------------------------------------------------------------------
// Location module — request/response types for the AMAP proxy.
//
// Query schemas use z.coerce.number(): the handler passes raw string query
// params (c.req.query()), the service tests pass numbers — both coerce to the
// same number type, keeping one schema for both layers.
// ---------------------------------------------------------------------------

// 附近位置：lng/lat（设备 WGS-84，服务端转 GCJ-02 后调高德）、radius 米
// （默认 3000，范围 1..50000）、keyword 可选（≤50 字）。
export const NearbyQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radius: z.coerce.number().int().min(1).max(50000).default(3000),
  keyword: z.string().trim().max(50).optional(),
});

// 关键字搜索：keyword 必填（1..50 字）；lng/lat 可选但必须成对出现
// （用于就近优先，同样先转 GCJ-02）。
export const SearchQuerySchema = z
  .object({
    keyword: z.string().trim().min(1).max(50),
    lng: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
  })
  .refine(
    (v) => (v.lng === undefined) === (v.lat === undefined),
    "经度和纬度必须同时提供或同时省略",
  );

export type NearbyInput = z.input<typeof NearbyQuerySchema>;

// z.coerce 使 z.input 类型退化为 unknown，故手动声明 service 层输入
// （radius 可省略，service 内部回退默认 3000；handler 经 schema 解析后必含）。
export type NearbyServiceInput = {
  lng: number;
  lat: number;
  radius?: number;
  keyword?: string;
};

export type SearchInput = z.infer<typeof SearchQuerySchema>;

// ---- Entry types（响应层）---------------------------------------------------

export type LocationItem = {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  distance?: number;
};

export type LocationQueryResult = { items: LocationItem[] };

export type LocationConfigEntry = { enabled: boolean };
