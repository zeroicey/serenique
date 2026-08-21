import { useLocation } from 'react-router'
import { PlaceholderPage } from '@/components/common/placeholder-page'

// 占位模块路由页：按当前路径推断模块名（宁序/习惯/设置共用此页；素材库已接入真实页面）。
const TITLES: Record<string, string> = {
  '/habit': '习惯',
  '/settings': '设置',
}

export default function PlaceholderModulePage() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? '该模块'
  return <PlaceholderPage title={title} />
}
