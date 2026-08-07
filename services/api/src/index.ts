import { env } from "@/env";
import { createApp } from "@/app";
import { startAuditSweeper } from "@/modules/audit/audit.service";
import { initBlobRoot } from "@/shared/storage";

// ---------------------------------------------------------------------------
// Entry point — validates env, initialises storage, assembles the app.
// If env is invalid or the blob root is misconfigured, the process crashes
// before starting the server.
// ---------------------------------------------------------------------------

await initBlobRoot(env.BLOB_ROOT);

// 后台审计日志清扫（保留天数 + 最大条数截断）。test 环境不启动，避免单测
// import service 泄漏定时器。
if (env.NODE_ENV !== "test") {
  startAuditSweeper();
}

const app = createApp(env);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
