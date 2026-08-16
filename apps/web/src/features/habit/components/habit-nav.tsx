import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHabitUIStore } from '@/stores/habit-ui'

// 习惯模块动态导航（今天页 / 总览页共用）：标题「习惯」+ 新建习惯按钮。
export function HabitNav() {
  const { openCreate } = useHabitUIStore()
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">习惯</span>
      <Button onClick={openCreate}>
        <Plus />
        新建习惯
      </Button>
    </div>
  )
}
