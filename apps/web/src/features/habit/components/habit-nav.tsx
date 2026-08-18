import { ArrowLeft, Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useHabitUIStore } from '@/stores/habit-ui'

// 习惯模块动态导航（今天页 / 总览页共用）：标题「习惯」+ 新建习惯按钮。
// 今天页提供「总览」入口；总览页将其换成「返回」回到今天页。
export function HabitNav() {
  const { openCreate } = useHabitUIStore()
  const navigate = useNavigate()
  const isOverview = useLocation().pathname === '/habit/overview'
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">习惯</span>
      <div className="flex items-center gap-2">
        {isOverview ? (
          <Button variant="outline" onClick={() => navigate('/habit')}>
            <ArrowLeft />
            返回
          </Button>
        ) : (
          <Button variant="outline" onClick={() => navigate('/habit/overview')}>
            总览
          </Button>
        )}
        <Button onClick={openCreate}>
          <Plus />
          新建习惯
        </Button>
      </div>
    </div>
  )
}
