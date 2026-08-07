import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

// 新建页动态导航：面包屑（闪记 / 新建）。
export function MomentCreateNav() {
  const navigate = useNavigate()
  return (
    <div className="flex w-full items-center gap-2">
      <Button variant="ghost" className="text-xl" onClick={() => navigate('/moment')}>
        闪记
      </Button>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <span className="text-lg">新建</span>
    </div>
  )
}
