import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

// PWA 更新提示：registerType=prompt 下，SW 检测到新版本时显示「刷新」横幅，
// 由用户主动触发 reload（autoUpdate 会强制刷新所有标签页，打断表单输入）。
// 文案必须中文（项目约定用户可见消息用中文）。
export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // 长驻标签页定时检查更新：SW 只在导航/重开时默认检查，闲置页面需主动轮询。
      if (registration) {
        const interval = setInterval(() => registration.update(), 60 * 60 * 1000)
        return () => clearInterval(interval)
      }
    },
  })

  // 离线就绪提示 5 秒后自动消失；异步 timer 内 setState，不构成 effect 同步级联渲染。
  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), 5000)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (needRefresh) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-lg">
          <span className="text-sm">发现新版本，刷新后生效</span>
          <Button size="sm" onClick={() => updateServiceWorker(true)}>
            立即刷新
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
            稍后
          </Button>
        </div>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className="rounded-lg border border-border bg-background px-4 py-2 shadow-lg">
          <span className="text-sm">已缓存，可离线使用</span>
        </div>
      </div>
    )
  }

  return null
}
