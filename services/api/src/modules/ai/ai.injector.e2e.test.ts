import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai'
import {
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent'
import { RUN_DB_TESTS, setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// before_agent_start 注入管线端到端测试（review 条件 2）：验证唯一的未测
// 联结点 ——「生产 loader（extensionFactories 注册 contextInjectorExtension）
// + 用户消息」下，模型**真实收到**的 systemPrompt 包含 L1 人设 + L2 用户画像
// + L3 时间块，且层级顺序正确。
//
// 用 pi-ai faux provider（本地假模型，不发真实 API）；其响应工厂可以拿到
// provider 收到的 Context（含 systemPrompt），从而断言「注入到模型那端」而
// 不是「钩子返回值」。
//
// GATED: RUN_DB_TESTS=1 —— L2 用户画像走真实 aiMemoryService（DB 写入），
// 与 ai.context-snapshot.integration.test.ts 同门控：
//
//   cd services/api && DATABASE_URL=postgresql://serenique:serenique@127.0.0.1:5433/serenique \
//     RUN_DB_TESTS=1 bun test src/modules/ai/ai.injector.e2e.test.ts
//
// 清理：beforeAll 写入的用户画（内容），afterAll 恢复为空；会话目录临时。
// ---------------------------------------------------------------------------

setTestEnv()

describe.skipIf(!RUN_DB_TESTS)('ai.context-injector e2e', () => {
  let tmpDir: string

  beforeAll(async () => {
    // 写入一段用户画像（L2）供钩子注入；测试结束后恢复为空。
    const { aiMemoryService } = await import('@/modules/ai-memory/ai-memory.service')
    await aiMemoryService.upsert({ content: '我喜欢喝美式咖啡，周末喜欢睡懒觉。' })
  })

  afterAll(async () => {
    if (!RUN_DB_TESTS) return
    const { aiMemoryService } = await import('@/modules/ai-memory/ai-memory.service')
    await aiMemoryService.upsert({ content: '' }).catch(() => {}) // 清空恢复空画像
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  test('before_agent_start 注入：模型收到的 systemPrompt 含 L1 人设 + L2 画像 + L3 时间块', async () => {
    // 1. faux provider：本地假模型（modelsPath null → 不读磁盘、不发网络）。
    const faux = fauxProvider()
    const modelRuntime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false })
    modelRuntime.registerNativeProvider(faux.provider)

    // 2. 生产同款 loader：noExtensions 隔离 + 内联扩展（含四层注入钩子）。
    const settingsManager = SettingsManager.inMemory()
    tmpDir = mkdtempSync(join(tmpdir(), 'serenique-injector-e2e-'))
    const { contextInjectorExtension } = await import('@/modules/ai/ai.service')
    const { buildBaseSystemPrompt } = await import('@/modules/ai/ai.system-prompt')
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => buildBaseSystemPrompt(),
      appendSystemPromptOverride: () => [],
      extensionFactories: [contextInjectorExtension],
    })
    await loader.reload()

    // 3. 会话：faux 响应工厂捕获 provider 真实收到的 Context.systemPrompt。
    const { createAgentSession, SessionManager } = await import('@earendil-works/pi-coding-agent')
    const { session } = await createAgentSession({
      sessionManager: SessionManager.create(process.cwd(), join(tmpDir, 'sessions')),
      settingsManager,
      modelRuntime,
      model: faux.getModel(),
      customTools: (await import('@/modules/ai/ai.tools')).buildAiTools(),
      excludeTools: ['bash', 'read', 'edit', 'write', 'grep', 'find', 'ls'],
      resourceLoader: loader,
    })

    const seenPrompts: string[] = []
    faux.setResponses([
      (ctx) => {
        seenPrompts.push(ctx.systemPrompt ?? '')
        return fauxAssistantMessage('好的呀，有什么可以帮你？')
      },
    ])

    try {
      await session.prompt('你好')
      expect(seenPrompts.length).toBe(1)
      const sp = seenPrompts[0]
      // L1：人设 + 工具段（含「不必再调工具」的快照引用说明）。
      expect(sp).toContain('你是「宁序」，一个温柔俏皮的女生')
      expect(sp).toContain('我在上方为你准备了动态信息')
      // L2：用户画像标题 + 内容（beforeAll 写入）。
      expect(sp).toContain('[用户画像]')
      expect(sp).toContain('我喜欢喝美式咖啡')
      // L3：时间块（每轮插入，含当前日期）。
      expect(sp).toContain('[当前时间]')
      expect(sp).toMatch(/现在是 \d{4}-\d{2}-\d{2}/)
      // 层级顺序：L1 在最前、L2 居中、L3 在其后。
      const i1 = sp.indexOf('你是「宁序」')
      const i2 = sp.indexOf('[用户画像]')
      const i3 = sp.indexOf('[当前时间]')
      expect(i1).toBeGreaterThanOrEqual(0)
      expect(i2).toBeGreaterThan(i1)
      expect(i3).toBeGreaterThan(i2)
    } finally {
      session.dispose()
    }
  }, 30000)
})
