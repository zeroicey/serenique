import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { RUN_DB_TESTS, setTestEnv, uniqueTitle } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Tokens service integration — real PostgreSQL (RUN_DB_TESTS=1).
//
// Service-level CRUD：create（明文一次）→ verify → list → revoke（verify
// 变 null）。不创建用户、不走 HTTP ceremony，与 auth 集成测试无竞态。
// ---------------------------------------------------------------------------

setTestEnv();

describe.skipIf(!RUN_DB_TESTS)("token service DB integration", () => {
  let tokenService: typeof import("@/modules/tokens/token.service").tokenService;
  let db: typeof import("@/db/connection").db;
  let apiTokens: typeof import("@/modules/tokens/token.schema").apiTokens;

  const createdTokenIds: string[] = [];

  afterAll(async () => {
    if (!RUN_DB_TESTS || createdTokenIds.length === 0) return;
    await db.delete(apiTokens).where(inArray(apiTokens.id, createdTokenIds));
  });

  beforeAll(async () => {
    tokenService = (await import("@/modules/tokens/token.service")).tokenService;
    db = (await import("@/db/connection")).db;
    apiTokens = (await import("@/modules/tokens/token.schema")).apiTokens;
  });

  test("create → verify round-trip；明文不落库、hash 落库", async () => {
    const name = uniqueTitle("tok");
    const { plaintext, item } = await tokenService.create({ name });
    createdTokenIds.push(item.id);

    expect(plaintext.startsWith("serenique_")).toBe(true);
    expect(item.name).toBe(name);
    expect(item.revokedAt).toBeNull();

    // 库中只有 hash + prefix，没有明文
    const [row] = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, item.id));
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.tokenHash).not.toContain(plaintext);
    expect(row!.prefix).toBe(plaintext.slice("serenique_".length, "serenique_".length + 8));

    // verify 命中；错误明文 → null
    expect((await tokenService.verify(plaintext))?.id).toBe(item.id);
    expect(await tokenService.verify("serenique_wrong-wrong-wrong-wrong-wrong-wrong")).toBeNull();

    // list 不含明文
    const listed = await tokenService.list();
    expect(listed.some((t) => t.id === item.id)).toBe(true);
    expect("plaintext" in listed[0]).toBe(false);
  });

  test("revoke → verify 返回 null；再次 revoke 抛 NOT_FOUND", async () => {
    const { plaintext, item } = await tokenService.create({
      name: uniqueTitle("tok-revoke"),
    });
    createdTokenIds.push(item.id);

    await tokenService.revoke({ id: item.id });
    expect(await tokenService.verify(plaintext)).toBeNull();
    // 已撤销的 id 不可重复撤销
    expect(tokenService.revoke({ id: item.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("last_used_at 在 verify 后被更新（fire-and-forget，轮询等待）", async () => {
    const { plaintext, item } = await tokenService.create({
      name: uniqueTitle("tok-used"),
    });
    createdTokenIds.push(item.id);

    const deadline = Date.now() + 2000;
    let lastUsedAt: Date | null = null;
    do {
      await tokenService.verify(plaintext);
      const [row] = await db
        .select({ lastUsedAt: apiTokens.lastUsedAt })
        .from(apiTokens)
        .where(eq(apiTokens.id, item.id));
      lastUsedAt = row?.lastUsedAt ?? null;
      if (lastUsedAt) break;
      await Bun.sleep(30);
    } while (Date.now() < deadline);
    expect(lastUsedAt).not.toBeNull();
  });
});
