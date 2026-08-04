import pino from "pino";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// Global pino logger — configured per environment.
// Development: human-readable (pino-pretty with colors and rich formatting).
// Production: structured JSON for log aggregation.
// ---------------------------------------------------------------------------

export const isDevelopment = env.NODE_ENV === "development";

export const logger = pino({
  level: isDevelopment ? "debug" : "info",
  ...(isDevelopment && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  }),
});

export type Logger = typeof logger;

// ---------------------------------------------------------------------------
// Tiny ANSI color helpers — used in development for rich console output.
// No external dependency needed.
// ---------------------------------------------------------------------------

type ColorFn = (s: string) => string;

const ansi = (code: number): ColorFn =>
  isDevelopment ? (s) => `\x1b[${code}m${s}\x1b[0m` : (s) => s;

export const c = {
  reset: ansi(0),
  bold: ansi(1),
  dim: ansi(2),
  red: ansi(31),
  green: ansi(32),
  yellow: ansi(33),
  blue: ansi(34),
  magenta: ansi(35),
  cyan: ansi(36),
  gray: ansi(90),
};
