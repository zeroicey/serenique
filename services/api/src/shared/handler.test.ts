import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { setTestEnv } from "@/test/helpers";
import { AppError, ErrorCode } from "@/shared/errors";

// ---------------------------------------------------------------------------
// handleError unit tests — assert the unified error envelope carries a `code`
// for every mapping branch (AppError / ZodError / SyntaxError / unknown).
// Uses a real Hono Context so `Res.build(c)` is exercised end-to-end.
// ---------------------------------------------------------------------------

// Must run before any module that parses `@/env` is imported. handleError →
// logger → env, so load it dynamically (the static imports above are all
// env-free).
setTestEnv();

let handleError: typeof import("@/shared/handler").handleError;

beforeAll(async () => {
  handleError = (await import("@/shared/handler")).handleError;
});

/** Build a minimal Hono app whose /t route throws `throwErr` and maps via handleError. */
function appFor(throwErr: () => unknown) {
  const app = new Hono();
  app.all("/t", (c) => {
    try {
      throwErr();
      return c.text("unexpected");
    } catch (e) {
      return handleError(e, c, "test");
    }
  });
  return app;
}

describe("handleError error envelope", () => {
  test("AppError → its code and status (e.g. diary 404)", async () => {
    const res = await appFor(() => {
      throw new AppError(ErrorCode.NOT_FOUND, "日记不存在", 404);
    }).request("/t");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      code: "NOT_FOUND",
      message: "日记不存在",
    });
  });

  test("ZodError → 400 VALIDATION with issues in error", async () => {
    const res = await appFor(() => {
      z.object({ id: z.string().uuid() }).parse({ id: "not-a-uuid" });
    }).request("/t");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION");
    expect(body.error).toBeDefined();
  });

  test("SyntaxError (malformed JSON) → 400 VALIDATION", async () => {
    const res = await appFor(() => {
      throw new SyntaxError("Unexpected token");
    }).request("/t");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      code: "VALIDATION",
      message: "请求体必须是合法的 JSON",
    });
  });

  test("unknown error → 500 INTERNAL", async () => {
    const res = await appFor(() => {
      throw new Error("boom");
    }).request("/t");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL");
  });
});
