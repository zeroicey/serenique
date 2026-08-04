import { env } from "@/env";
import { createApp } from "@/app";
import { initBlobRoot } from "@/shared/storage";

// ---------------------------------------------------------------------------
// Entry point — validates env, initialises storage, assembles the app.
// If env is invalid or the blob root is misconfigured, the process crashes
// before starting the server.
// ---------------------------------------------------------------------------

await initBlobRoot(env.BLOB_ROOT);

const app = createApp(env);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
