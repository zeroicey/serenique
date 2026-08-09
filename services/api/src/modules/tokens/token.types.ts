import { z } from "zod";

// ---------------------------------------------------------------------------
// Tokens module — request/response types (GitHub PAT mode).
// 明文绝不进入列表/详情响应，只在创建响应出现一次。
// ---------------------------------------------------------------------------

export const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type CreateTokenInput = z.input<typeof CreateTokenSchema>;

export type TokenEntry = {
  id: string;
  name: string;
  /** 展示用明文片段（随机段前 8 位），无明文。 */
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** 创建响应：明文仅此一次。 */
export type TokenCreateResult = {
  plaintext: string;
  item: TokenEntry;
};
