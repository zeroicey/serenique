#!/usr/bin/env bun
/**
 * 回填脚本：为存量 moments 计算并写入 pinyin / pinyin_initial 派生列。
 *
 * 用法（在 services/api 目录下）：
 *   bun scripts/backfill-moment-pinyin.ts
 *
 * 幂等：遍历全部 moments，逐条计算拼音；仅当当前值不一致时才 UPDATE，
 * 重复执行结果不变（不删除、不覆盖为相同值）。迁移上线后由部署流程执行一次。
 *
 * 只依赖 DATABASE_URL —— 故意不 import @/env（完整 env 校验会因缺少
 * SESSION_SECRET / BLOB_ROOT 等而崩溃）；路径别名 @/* 由 bun 按
 * services/api/tsconfig.json 解析。
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { moments } from "@/modules/moment/moment.schema";
import { toPinyinColumns } from "@/modules/moment/moment.domain";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("错误：缺少 DATABASE_URL 环境变量（脚本只依赖数据库连接）。");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema: { moments } });

const rows = await db
  .select({ id: moments.id, text: moments.text })
  .from(moments);

console.log(`共 ${rows.length} 条闪念，开始计算拼音…`);

let updated = 0;
let unchanged = 0;

for (const [index, row] of rows.entries()) {
  const { pinyin, pinyinInitial } = toPinyinColumns(row.text);
  const [current] = await db
    .select({ pinyin: moments.pinyin, pinyinInitial: moments.pinyinInitial })
    .from(moments)
    .where(eq(moments.id, row.id));

  if (
    current &&
    current.pinyin === pinyin &&
    current.pinyinInitial === pinyinInitial
  ) {
    unchanged++;
  } else {
    await db
      .update(moments)
      .set({ pinyin, pinyinInitial })
      .where(eq(moments.id, row.id));
    updated++;
  }

  if ((index + 1) % 100 === 0 || index + 1 === rows.length) {
    console.log(`进度：${index + 1}/${rows.length}`);
  }
}

if (rows.length === 0) {
  console.log("无存量闪念，无需回填。");
} else {
  console.log(
    `回填完成：共处理 ${rows.length} 条，更新 ${updated} 条，未变化 ${unchanged} 条（重复执行结果一致）。`,
  );
}

await client.end();
