import pino from "pino";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// Global pino logger — configured per environment.
// Development: human-readable (pino-pretty). Production: structured JSON.
// ---------------------------------------------------------------------------

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: isDev ? "debug" : "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    },
  }),
});

export type Logger = typeof logger;
