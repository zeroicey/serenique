import { ChevronRight, FileText } from 'lucide-react'
import { Link } from 'react-router'

// 首页：极简品牌 + 模块入口卡片，占位后续丰富。
export default function WelcomePage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-4">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">Serenique</h1>
        <p className="text-muted-foreground">个人闪念与笔记</p>
      </div>
      <nav className="w-full max-w-sm">
        <Link
          to="/moment"
          className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
        >
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-lg">闪念</span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      </nav>
    </div>
  )
}
