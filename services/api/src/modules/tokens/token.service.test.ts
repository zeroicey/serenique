import { describe, expect, test } from "bun:test";
import { CreateTokenSchema } from "./token.types";
import {
  generateToken,
  hashToken,
  prefixOf,
  tokenMatches,
  TOKEN_PREFIX,
} from "./token.domain";

// ---------------------------------------------------------------------------
// Tokens domain unit tests — generation format, hashing, prefix, constant-time
// compare. No DB / IO.
// ---------------------------------------------------------------------------

describe("generateToken", () => {
  test("serenique_ 前缀 + 32 字节 base64url（43 字符）", () => {
    const token = generateToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBe(TOKEN_PREFIX.length + 43);
    expect(token).toMatch(/^serenique_[A-Za-z0-9_-]+$/);
  });

  test("两次生成互不相同", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("hashToken / tokenMatches", () => {
  test("SHA-256 hex：64 字符、确定性、与明文无关泄露", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash); // 确定性
    expect(hashToken(token)).not.toContain(token);
  });

  test("常量时间比对：相同 → true，任何差异 → false", () => {
    const token = generateToken();
    expect(tokenMatches(token, hashToken(token))).toBe(true);
    expect(tokenMatches(token + "x", hashToken(token))).toBe(false);
    expect(tokenMatches("wrong", hashToken(token))).toBe(false);
    expect(tokenMatches(token, "deadbeef")).toBe(false);
  });
});

describe("prefixOf", () => {
  test("随机段前 8 位（品牌前缀恒定，随机段才是身份信息）", () => {
    const token = generateToken();
    expect(prefixOf(token)).toBe(token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 8));
    expect(prefixOf(token)).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });
});

describe("CreateTokenSchema", () => {
  test("合法 name 通过，空/超长拒绝", () => {
    expect(CreateTokenSchema.parse({ name: "macbook" }).name).toBe("macbook");
    expect(CreateTokenSchema.parse({ name: "  server  " }).name).toBe("server");
    expect(() => CreateTokenSchema.parse({ name: "" })).toThrow();
    expect(() => CreateTokenSchema.parse({ name: "x".repeat(101) })).toThrow();
    expect(() => CreateTokenSchema.parse({})).toThrow();
  });
});
