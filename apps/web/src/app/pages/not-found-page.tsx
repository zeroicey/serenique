import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <p className="text-2xl font-semibold">页面不存在</p>
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        返回首页
      </Link>
    </div>
  )
}
