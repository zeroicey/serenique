// 通用「开发中」占位页：新模块（宁序/习惯/素材库/设置等）先展示这里。
export function PlaceholderPage({
  title,
  message,
}: {
  title: string
  message?: string
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-4xl">🚧</p>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="max-w-sm text-muted-foreground">
        {message ?? `「${title}」模块正在开发中，敬请期待。`}
      </p>
    </div>
  )
}
