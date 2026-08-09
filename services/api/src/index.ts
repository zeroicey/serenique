import { env } from "@/env";
import { createApp } from "@/app";
import { startAuditSweeper } from "@/modules/audit/audit.service";
import { authService } from "@/modules/auth/auth.service";
import { initBlobRoot } from "@/shared/storage";

// ---------------------------------------------------------------------------
// Entry point — validates env, initialises storage, assembles the app.
// If env is invalid or the blob root is misconfigured, the process crashes
// before starting the server.
// ---------------------------------------------------------------------------

await initBlobRoot(env.BLOB_ROOT);

// 启动 fail-closed（决策⑨）：认证启用（生产）且 users 空表 → 拒绝启动，
// 提示先运行引导脚本 bun scripts/bootstrap-user.ts 创建首个用户。
// 只走真实启动路径（index.ts），createApp 不检查——测试 app 不连 DB。
await authService.assertUsersSeeded();

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
