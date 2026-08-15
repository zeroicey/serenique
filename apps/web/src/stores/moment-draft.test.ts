import { beforeEach, describe, expect, test } from 'vitest'
import { useMomentDraftStore } from './moment-draft'

const STORAGE_KEY = 'serenique.moment.draft.text'

beforeEach(() => {
  localStorage.clear()
  // persist 中间件在模块加载时已 hydrate；重置 store 本体避免跨用例状态泄漏
  useMomentDraftStore.setState({ draftText: '' })
})

describe('moment-draft store', () => {
  test('setDraftText 写入 localStorage（刷新不丢）', () => {
    useMomentDraftStore.getState().setDraftText('此刻在想什么')
    expect(localStorage.getItem(STORAGE_KEY)).toContain('此刻在想什么')
  })

  test('clearDraft 清空内存且持久化后无残留草稿', () => {
    useMomentDraftStore.getState().setDraftText('草稿')
    useMomentDraftStore.getState().clearDraft()
    expect(useMomentDraftStore.getState().draftText).toBe('')
    // 空串草稿等价于无草稿：重新 hydrate 后仍为空
    useMomentDraftStore.persist.rehydrate()
    expect(useMomentDraftStore.getState().draftText).toBe('')
  })

  test('重新 hydration 时从 localStorage 恢复草稿', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { draftText: '恢复的草稿' }, version: 0 }),
    )
    // persist 的 hydrate 由 storage 事件触发；这里手动验证 merge 语义
    useMomentDraftStore.persist.rehydrate()
    expect(useMomentDraftStore.getState().draftText).toBe('恢复的草稿')
  })
})
