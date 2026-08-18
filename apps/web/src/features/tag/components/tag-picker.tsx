import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import type { TagEntry } from '@/features/tag/api'

// 标签选择器：**只选已有标签**（不含新建入口）。输入过滤 + 点选切换 + 已选 chips 展示。
// 纯受控组件（tags 由调用方经 useTags 传入），便于在新建闪记页与编辑标签弹窗复用。
interface TagPickerProps {
  tags: TagEntry[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}

export function TagPicker({
  tags,
  selectedIds,
  onChange,
  placeholder = '搜索标签',
}: TagPickerProps) {
  const [query, setQuery] = useState('')
  const selected = useMemo(
    () => tags.filter((t) => selectedIds.includes(t.id)),
    [tags, selectedIds],
  )
  const unselected = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tags.filter(
      (t) => !selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)),
    )
  }, [tags, selectedIds, query])

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs"
            >
              #{t.name}
              <button
                type="button"
                aria-label={`移除标签 ${t.name}`}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => onChange(selectedIds.filter((id) => id !== t.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label="搜索标签"
      />

      {unselected.length > 0 ? (
        <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
          {unselected.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent"
              onClick={() => onChange([...selectedIds, t.id])}
            >
              <span>#{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.momentCount}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-2 py-1 text-xs text-muted-foreground">
          {tags.length === 0 ? '还没有标签，去标签页创建一个吧' : '没有匹配的标签'}
        </div>
      )}
    </div>
  )
}
