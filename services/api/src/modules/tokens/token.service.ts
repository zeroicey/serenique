import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/connection";
import { fireAuditRecord } from "@/modules/audit/audit.service";
import { generateToken, hashToken, prefixOf } from "@/modules/tokens/token.domain";
import { toTokenEntry } from "@/modules/tokens/token.mappers";
import { apiTokens } from "@/modules/tokens/token.schema";
import type { CreateTokenInput, TokenCreateResult, TokenEntry } from "@/modules/tokens/token.types";
import { AppError, ErrorCode } from "@/shared/errors";
import { logger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// Tokens service — manageable API tokens (CLI / scripts / 移动端备用)。
// 明文只存 hash；verify() 是中间件的 Bearer 校验入口。
// ---------------------------------------------------------------------------

export const tokenService = {
  /** 创建令牌：明文仅本次响应返回（此后只剩 hash + prefix）。 */
  async create(input: CreateTokenInput): Promise<TokenCreateResult> {
    const plaintext = generateToken();
    const [row] = await db
      .insert(apiTokens)
      .values({
        name: input.name,
        tokenHash: hashToken(plaintext),
        prefix: prefixOf(plaintext),
      })
      .returning();
    fireAuditRecord({
      event: "token.create",
      message: "创建 API 令牌",
      level: "info",
      detail: { id: row.id, name: row.name },
    });
    return { plaintext, item: toTokenEntry(row) };
  },

  /**
   * 校验 Bearer 令牌：按 hash 查行；已撤销 / 不存在 → null。
   * last_used_at 更新 fire-and-forget（失败只记日志，不影响主流程）。
   */
  async verify(plaintext: string): Promise<TokenEntry | null> {
    const [row] = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, hashToken(plaintext)));
    if (!row || row.revokedAt) return null;
    void db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id))
      .catch((err) => {
        logger.error({ err }, "token last_used_at update failed");
      });
    return toTokenEntry(row);
  },

  /** 列表（不含明文）。 */
  async list(): Promise<TokenEntry[]> {
    const rows = await db
      .select()
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt));
    return rows.map(toTokenEntry);
  },

  /** 撤销（软删除）：revoked_at = now；已撤销/不存在 → NOT_FOUND。 */
  async revoke(input: { id: string }): Promise<void> {
    const [row] = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, input.id), isNull(apiTokens.revokedAt)))
      .returning({ id: apiTokens.id, name: apiTokens.name });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "令牌不存在", 404);
    fireAuditRecord({
      event: "token.revoke",
      message: "已撤销 API 令牌",
      level: "warn",
      detail: { id: row.id, name: row.name },
    });
  },
};
