import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BLOB_ROOT: z.string().min(1),
  BLOB_MAX_SIZE: z.coerce.number().positive().default(100 * 1024 * 1024), // 100 MB
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
