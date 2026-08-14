#!/usr/bin/env bun
/**
 * 引导脚本：创建 Serenique 首个用户（users 表，单行语义）——决策⑨。
 *
 * 用法（在 services/api 目录下）：
 *   bun scripts/bootstrap-user.ts --name 张三 --email a@example.com --birthday 1990-01-01
 *   FIRST_USER_NAME=张三 bun scripts/bootstrap-user.ts
 * 参数优先于环境变量 FIRST_USER_NAME / FIRST_USER_EMAIL / FIRST_USER_BIRTHDAY；
 * 全部缺省则插入一行空用户（个人信息之后走 /users/me 补全）。
 *
 * 幂等：users 表已有行 → 打印已存在并退出 0。
 *
 * 只依赖 DATABASE_URL —— 故意不 import @/env（完整 env 校验会因缺少
 * SESSION_SECRET / BLOB_ROOT 等而崩溃）；路径别名 @/* 由 bun 按
 * services/api/tsconfig.json 解析。
 *
 * 服务器（镜像内）执行：docker compose run --rm api bun scripts/bootstrap-user.ts
 * 注意：docker compose run 会覆盖 CMD，docker-entrypoint.sh 的 localhost →
 * host.docker.internal 重写不会执行，需确保传给容器的 DATABASE_URL 指向
 * 宿主机可达的地址。
 */
import { parseArgs } from 'node:util'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { users } from '@/modules/auth/auth.schema'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('错误：缺少 DATABASE_URL 环境变量（脚本只依赖数据库连接）。')
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    help: { type: 'boolean' },
    name: { type: 'string' },
    email: { type: 'string' },
    birthday: { type: 'string' },
  },
  allowPositionals: false,
  strict: true,
})

if (values.help) {
  console.log(
    [
      '用法：bun scripts/bootstrap-user.ts [--name 名字] [--email 邮箱] [--birthday YYYY-MM-DD]',
      '',
      '创建首个用户（幂等：已有用户则直接退出）。',
      '参数优先级高于环境变量 FIRST_USER_NAME / FIRST_USER_EMAIL / FIRST_USER_BIRTHDAY；',
      '全部缺省则插入一行空用户（个人信息之后走 /users/me 补全）。',
    ].join('\n'),
  )
  process.exit(0)
}

const name = (values.name ?? process.env.FIRST_USER_NAME ?? '').trim() || null
const email = (values.email ?? process.env.FIRST_USER_EMAIL ?? '').trim() || null
const birthday = (values.birthday ?? process.env.FIRST_USER_BIRTHDAY ?? '').trim() || null

if (birthday) {
  const ok =
    /^\d{4}-\d{2}-\d{2}$/.test(birthday) &&
    !Number.isNaN(Date.parse(`${birthday}T00:00:00Z`)) &&
    new Date(Date.parse(`${birthday}T00:00:00Z`)).toISOString().slice(0, 10) === birthday
  if (!ok) {
    console.error(`错误：--birthday 不是有效日期（须为 YYYY-MM-DD）：${birthday}`)
    process.exit(1)
  }
}

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client, { schema: { users } })

const [existing] = await db.select({ id: users.id, name: users.name }).from(users).limit(1)
if (existing) {
  console.log(
    `用户已存在（id: ${existing.id}${existing.name ? `，名称「${existing.name}」` : ''}），无需重复创建。`,
  )
  console.log('可直接使用现有通行密钥登录；如需添加新设备，登录后在设置页操作。')
  await client.end()
  process.exit(0)
}

const [row] = await db.insert(users).values({ name, email, birthday }).returning()
console.log(`已创建用户：${row.name ?? '(未命名)'}（id: ${row.id}）`)

const setupToken = process.env.SETUP_TOKEN
if (setupToken) {
  const webDomain = process.env.WEBAUTHN_RP_ID ?? 'your-web-domain'
  console.log(
    `请打开 https://${webDomain}/setup?setupToken=${setupToken} 在浏览器创建首个通行密钥。`,
  )
} else {
  console.log(
    '提示：服务端尚未配置 SETUP_TOKEN；配置后打开 https://<WEB域名>/setup?setupToken=<SETUP_TOKEN> 在浏览器创建首个通行密钥。',
  )
}
await client.end()
