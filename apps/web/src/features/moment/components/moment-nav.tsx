import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

// 列表页动态导航：标题 + 新建按钮。
export function MomentNav() {
  const navigate = useNavigate()
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">闪记</span>
      <Button onClick={() => navigate('/moment/create')}>
        <Plus />
        新建闪记
      </Button>
    </div>
  )
}
