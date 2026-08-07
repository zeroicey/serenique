// 占位模块的动态导航：只显示模块标题（对齐 AppNavbar「标题随路由」）。
// 无 hooks，可在路由 handle.nav 里以元素形式静态注册。
export function ModuleTitleNav({ title }: { title: string }) {
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">{title}</span>
    </div>
  )
}
