import { create } from 'zustand'

interface MomentDraftState {
  draftText: string
  setDraftText: (text: string) => void
  clearDraft: () => void
}

// 新建页草稿（仅 UI 会话状态；服务端数据不走 zustand）。
export const useMomentDraftStore = create<MomentDraftState>((set) => ({
  draftText: '',
  setDraftText: (text) => set({ draftText: text }),
  clearDraft: () => set({ draftText: '' }),
}))
