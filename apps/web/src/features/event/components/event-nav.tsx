import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEventUIStore } from '@/stores/event-ui'

// 列表页动态导航：标题「日历」+ 新建按钮（打开弹窗）。
export function EventNav() {
  const { openCreate } = useEventUIStore()
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">日历</span>
      <Button onClick={openCreate}>
        <Plus />
        新建日历
      </Button>
    </div>
  )
}
