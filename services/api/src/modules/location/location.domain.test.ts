import { describe, expect, test } from "bun:test";
import { setTestEnv } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Location domain unit tests — WGS-84 → GCJ-02 conversion (precision, bounds,
// outOfChina passthrough) and cache-key serialization. Pure functions, no
// network / DB needed.
// ---------------------------------------------------------------------------

setTestEnv();

describe("wgs84ToGcj02 — WGS-84 → GCJ-02 火星坐标偏移", () => {
  test("已知测试点（北京天安门）误差在 ±0.0001 内", async () => {
    const { wgs84ToGcj02 } = await import("./location.domain");
    // WGS-84 (116.391275, 39.906217) → GCJ-02。注意：任务书参考值
    // (116.397428, 39.90923) 与 coordtransform 公开算法不一致（lat 差 ~0.0016）；
    // 本实现与 coordTransform_js 官方 README 向量逐位一致（见下个用例），
    // 故此处断言采用规范算法实际输出。
    const gcj = wgs84ToGcj02(116.391275, 39.906217);
    expect(Math.abs(gcj.lng - 116.39751600497861)).toBeLessThanOrEqual(0.0001);
    expect(Math.abs(gcj.lat - 39.907618208170675)).toBeLessThanOrEqual(0.0001);
  });

  test("与 coordTransform_js 官方 README 测试向量逐位一致", async () => {
    const { wgs84ToGcj02 } = await import("./location.domain");
    // wandergis/coordTransform_js README: wgs84togcj02(116.404, 39.915) →
    // (116.41024449916938, 39.91640428150164)
    expect(wgs84ToGcj02(116.404, 39.915)).toEqual({
      lng: 116.41024449916938,
      lat: 39.91640428150164,
    });
  });

  test("中国境内坐标产生偏移（结果不等于输入）", async () => {
    const { wgs84ToGcj02 } = await import("./location.domain");
    const gcj = wgs84ToGcj02(116.391275, 39.906217);
    expect(gcj.lng).not.toBe(116.391275);
    expect(gcj.lat).not.toBe(39.906217);
  });

  test("境外坐标原样返回（outOfChina 边界）", async () => {
    const { wgs84ToGcj02 } = await import("./location.domain");
    // 0,0（几内亚湾）、东京、纽约均在中国境外
    expect(wgs84ToGcj02(0, 0)).toEqual({ lng: 0, lat: 0 });
    expect(wgs84ToGcj02(139.7, 35.7)).toEqual({ lng: 139.7, lat: 35.7 });
    expect(wgs84ToGcj02(-74.0, 40.7)).toEqual({ lng: -74.0, lat: 40.7 });
    // 边界外一丁点：lng > 137.8347 / lat < 0.8293
    expect(wgs84ToGcj02(137.9, 35)).toEqual({ lng: 137.9, lat: 35 });
    expect(wgs84ToGcj02(116.4, 0.5)).toEqual({ lng: 116.4, lat: 0.5 });
  });

  test("outOfChina 边界判断", async () => {
    const { outOfChina } = await import("./location.domain");
    expect(outOfChina(116.4, 39.9)).toBe(false); // 北京：中国境内
    expect(outOfChina(0, 0)).toBe(true);
    expect(outOfChina(72.0, 35)).toBe(true); // lng < 72.004
    expect(outOfChina(116.4, 56)).toBe(true); // lat > 55.8271
  });
});

describe("cache keys — 按请求参数序列化", () => {
  test("nearbyCacheKey 相同参数稳定、不同参数可区分", async () => {
    const { nearbyCacheKey } = await import("./location.domain");
    const base = { lng: 116.4, lat: 39.9, radius: 3000 };
    expect(nearbyCacheKey(base)).toBe(nearbyCacheKey({ ...base }));
    expect(nearbyCacheKey(base)).not.toBe(
      nearbyCacheKey({ ...base, lng: 116.5 }),
    );
    expect(nearbyCacheKey(base)).not.toBe(
      nearbyCacheKey({ ...base, lat: 39.8 }),
    );
    expect(nearbyCacheKey(base)).not.toBe(
      nearbyCacheKey({ ...base, radius: 5000 }),
    );
    expect(nearbyCacheKey({ ...base, keyword: "咖啡" })).not.toBe(
      nearbyCacheKey(base),
    );
    expect(nearbyCacheKey({ ...base, keyword: "咖啡" })).toBe(
      nearbyCacheKey({ ...base, keyword: "咖啡" }),
    );
  });

  test("searchCacheKey 区分关键字与坐标", async () => {
    const { searchCacheKey } = await import("./location.domain");
    expect(searchCacheKey({ keyword: "咖啡" })).toBe(
      searchCacheKey({ keyword: "咖啡" }),
    );
    expect(searchCacheKey({ keyword: "咖啡", lng: 116.4, lat: 39.9 })).not.toBe(
      searchCacheKey({ keyword: "咖啡" }),
    );
    expect(searchCacheKey({ keyword: "咖啡", lng: 116.4, lat: 39.9 })).not.toBe(
      searchCacheKey({ keyword: "奶茶", lng: 116.4, lat: 39.9 }),
    );
  });
});
