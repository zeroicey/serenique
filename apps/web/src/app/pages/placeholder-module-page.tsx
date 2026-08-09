import { useLocation } from 'react-router'
import { PlaceholderPage } from '@/components/common/placeholder-page'

// 占位模块路由页：按当前路径推断模块名（宁序/习惯/素材库/设置共用此页）。
const TITLES: Record<string, string> = {
  '/habit': '习惯',
  '/files': '素材库',
  '/settings': '设置',
}

export default function PlaceholderModulePage() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? '该模块'
  return <PlaceholderPage title={title} />
}
