import { env } from "@/env";
import { createApp } from "@/app";

// ---------------------------------------------------------------------------
// Entry point — validates env, assembles the app, exports for Bun.
// If env is invalid, the process crashes here before anything else runs.
// ---------------------------------------------------------------------------

const app = createApp(env);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
