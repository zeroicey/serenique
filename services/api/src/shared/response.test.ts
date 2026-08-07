import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import { Res } from "@/shared/response";

// ---------------------------------------------------------------------------
// Res builder unit tests — the error envelope must carry a `code`, success
// responses must NOT, and 204 must stay body-less. A minimal fake Context
// provides just enough of Hono's c.json / c.body surface for build().
// ---------------------------------------------------------------------------

function fakeContext(): Context {
  const c = {
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    body: (body: BodyInit | null, status: number) =>
      new Response(body, { status }),
  };
  return c as unknown as Context;
}

describe("Res error envelope", () => {
  test(".code() adds code to the error body", async () => {
    const res = Res.error("日记不存在")
      .code("NOT_FOUND")
      .status(404)
      .build(fakeContext());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      message: "日记不存在",
      code: "NOT_FOUND",
    });
  });

  test("error shortcuts carry a matching default code", async () => {
    const notFound = await Res.notFound("不存在").build(fakeContext()).json();
    expect(notFound.code).toBe("NOT_FOUND");

    const badRequest = await Res.badRequest("参数错误").build(fakeContext()).json();
    expect(badRequest.code).toBe("VALIDATION");

    const validation = await Res.validationFailed("参数校验失败").build(fakeContext()).json();
    expect(validation.code).toBe("VALIDATION");

    const unauthorized = await Res.unauthorized("未认证").build(fakeContext()).json();
    expect(unauthorized.code).toBe("UNAUTHORIZED");

    const internal = await Res.internalError().build(fakeContext()).json();
    expect(internal.code).toBe("INTERNAL");
  });

  test("success builders never include code", async () => {
    const ok = await Res.ok("成功", { x: 1 }).build(fakeContext()).json();
    expect(ok).toEqual({ success: true, message: "成功", data: { x: 1 } });
    expect(ok.code).toBeUndefined();

    const created = await Res.created("已创建", { y: 2 }).build(fakeContext()).json();
    expect(created.code).toBeUndefined();
  });

  test("204 noContent stays body-less and code-less", async () => {
    const res = Res.noContent("已删除").build(fakeContext());
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});
