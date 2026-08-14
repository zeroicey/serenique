import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  type LucideIcon,
  ScrollText,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router'

// 首页：极简品牌 + 模块入口卡片。条目与侧边栏保持一致。
const MODULES: { icon: LucideIcon; label: string; path: string }[] = [
  { icon: Sparkles, label: '宁序', path: '/ai' },
  { icon: Zap, label: '闪记', path: '/moment' },
  { icon: CheckCircle2, label: '任务', path: '/task' },
  { icon: CalendarDays, label: '日历', path: '/event' },
  { icon: ScrollText, label: '日志', path: '/audit' },
]

export default function WelcomePage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-4">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">Serenique</h1>
        <p className="text-muted-foreground">个人闪记与笔记</p>
      </div>
      <nav className="flex w-full max-w-sm flex-col gap-3">
        {MODULES.map((m) => (
          <Link
            key={m.path}
            to={m.path}
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
          >
            <m.icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-lg">{m.label}</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </nav>
    </div>
  )
}
