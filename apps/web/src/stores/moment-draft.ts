import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface MomentDraftState {
  draftText: string
  setDraftText: (text: string) => void
  clearDraft: () => void
}

// 新建页草稿：localStorage 持久化（刷新/关页/误触返回不丢正文）。
// 仅持久化 draftText（局部选择 partialize）；服务端数据不走 zustand。
export const useMomentDraftStore = create<MomentDraftState>()(
  persist(
    (set) => ({
      draftText: '',
      setDraftText: (text) => set({ draftText: text }),
      clearDraft: () => set({ draftText: '' }),
    }),
    {
      name: 'serenique.moment.draft.text',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ draftText: state.draftText }),
    },
  ),
)
