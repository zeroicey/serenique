import { Hono } from "hono";
import type { Env } from "@/env";
import { cors, logger } from "@/middleware";
import { diaryRouter } from "@/modules/diary";
import { momentRouter } from "@/modules/moment";
import { blobRouter } from "@/modules/blob";
import { taskRouter } from "@/modules/task";
import { eventRouter } from "@/modules/event";
import { authRouter } from "@/modules/auth";
import { Res } from "@/shared/response";
import { logger as pinoLogger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// App factory — receives validated env, returns an assembled Hono instance.
// Middleware and routes are wired here, in order.
// ---------------------------------------------------------------------------

export function createApp(env: Env) {
  // ---- 0. Fail-closed: 生产必须配置 AUTH_TOKEN，否则拒绝启动 --------------
  //    createApp(env) 的 env 来自 @/env（index.ts 同一次解析），生产缺失即崩溃。
  if (env.NODE_ENV === "production" && !env.AUTH_TOKEN) {
    throw new Error("生产环境必须配置 AUTH_TOKEN 才能启动（认证 fail-closed）");
  }

  const app = new Hono();

  // ---- 1. Global error handler --------------------------------------------
  //    Catches unhandled errors from any layer below.
  //
  app.onError((err, c) => {
    pinoLogger.error({ err, method: c.req.method, path: c.req.path }, "Unhandled error");
    return Res.internalError().build(c);
  });

  // ---- 2. Global middleware -----------------------------------------------
  //    Order: CORS first (preflight), then logger.
  //
  app.use("*", cors());
  app.use("*", logger);

  // ---- 3. Meta routes -----------------------------------------------------
  //
  app.get("/health", (c) => Res.ok("服务运行中", { status: "ok" }).build(c));
  app.get("/", (c) =>
    Res.ok("Serenique API", {
      modules: ["diary", "moment", "blob", "task", "event"],
    }).build(c),
  );

  // ---- 4. API modules -----------------------------------------------------
  //    Each module is a self-contained Hono instance mounted under /api.
  //
  // app.use("/api/*", authMiddleware); // Task 5 实现，先注释避免未定义引用
  // Task 5: authMiddleware 在此挂载
  app.route("/api", authRouter);
  app.route("/api", diaryRouter);
  app.route("/api", momentRouter);
  app.route("/api", blobRouter);
  app.route("/api", taskRouter);
  app.route("/api", eventRouter);

  // ---- 5. 404 fallback ----------------------------------------------------
  app.notFound((c) => Res.notFound("接口不存在").build(c));

  return app;
}
