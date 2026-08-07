import { Badge } from '@/components/ui/badge'
import type { AuditLevel } from '../api'

// 级别角标：info=信息（中性）、warn=警告（琥珀）、error=错误（红）。
const LEVEL_META: Record<AuditLevel, { label: string; variant: 'outline' | 'secondary' | 'destructive' }> = {
  info: { label: '信息', variant: 'secondary' },
  warn: { label: '警告', variant: 'outline' },
  error: { label: '错误', variant: 'destructive' },
}

export function AuditLevelBadge({ level }: { level: AuditLevel }) {
  const meta = LEVEL_META[level]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}
