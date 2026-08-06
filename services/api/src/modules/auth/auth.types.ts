import { z } from "zod";

export const LoginSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

export type LoginInput = z.input<typeof LoginSchema>;

export type AuthStatusEntry = { authenticated: boolean };
export type LoginOutcome = "ok" | "rejected" | "throttled";
