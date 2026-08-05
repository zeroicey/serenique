import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

// 新建/编辑页动态导航：面包屑（日记 / 写日记）。
export function DiaryCreateNav() {
  const navigate = useNavigate()
  return (
    <div className="flex w-full items-center gap-2">
      <Button variant="ghost" className="text-xl" onClick={() => navigate('/diary')}>
        日记
      </Button>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <span className="text-lg">写日记</span>
    </div>
  )
}
