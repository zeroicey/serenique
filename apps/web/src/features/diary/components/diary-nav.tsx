import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

// 列表页动态导航：标题「日记」+ 新建按钮。
export function DiaryNav() {
  const navigate = useNavigate()
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">日记</span>
      <Button onClick={() => navigate('/diary/write')}>
        <Plus />
        新建日记
      </Button>
    </div>
  )
}
