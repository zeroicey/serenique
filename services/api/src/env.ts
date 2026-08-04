import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
