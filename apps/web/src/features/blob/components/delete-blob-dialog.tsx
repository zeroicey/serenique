import { AlertTriangle, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type BlobEntry, R2_GATEWAY_ORIGIN } from '@/features/blob/api'
import { useBlobAttachments, useDeleteBlob } from '@/features/blob/queries'

// ownerType → 用户可读名。moment 附件同样写入 blob_attachments（ownerType='moment'），
// listAttachments 无 ownerType 过滤会原样返回；其余业务模块通过通用引用注册。
const OWNER_TYPE_LABELS: Record<string, string> = {
  moment: '闪记',
  diary: '日记',
  event: '日历事件',
  task: '任务',
  habit: '习惯',
  ai: '宁序对话',
}

// 删除确认弹窗：打开时懒查该 blob 的业务引用。
// 有引用 → 禁删并列出引用方；无引用 → 确认后调用 DELETE（后端引用保护兜底 409）。
export function DeleteBlobDialog({
  blob,
  onClose,
}: {
  blob: BlobEntry | null
  onClose: () => void
}) {
  const { data: refs, isLoading } = useBlobAttachments(blob?.id ?? null)
  const deleteBlob = useDeleteBlob()

  const refsGrouped = useMemo(() => {
    if (!refs) return []
    const byType = new Map<string, number>()
    for (const ref of refs) byType.set(ref.ownerType, (byType.get(ref.ownerType) ?? 0) + 1)
    return [...byType.entries()].map(([ownerType, count]) => ({
      label: OWNER_TYPE_LABELS[ownerType] ?? ownerType,
      count,
    }))
  }, [refs])

  const hasRefs = (refs?.length ?? 0) > 0

  const handleDelete = () => {
    if (!blob) return
    deleteBlob.mutate(blob.id, {
      onSuccess: (result) => {
        // r2 后端：DB 行已删，文件体需浏览器直发网关签名删除（best-effort，
        // fire-and-forget；失败不阻断——孤儿对象由后续清理兜底）。
        for (const url of result?.deleteUrls ?? []) {
          let u: URL | null = null
          try {
            u = new URL(url)
          } catch {
            continue
          }
          if (u.origin !== R2_GATEWAY_ORIGIN) continue // 防御性：仅官方网关
          void fetch(u, { method: 'DELETE' }).catch(() => {})
        }
        onClose()
      },
    })
  }

  return (
    <Dialog open={blob !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除文件</DialogTitle>
          <DialogDescription className="break-all">{blob?.originalName}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasRefs ? (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              该文件仍被 {refs?.length} 处内容引用，无法删除
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {refsGrouped.map(({ label, count }) => (
                <li
                  key={label}
                  className="rounded bg-background px-2 py-0.5 text-xs text-foreground"
                >
                  {label} × {count}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              请先在对应内容中移除该附件后再删除文件。
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            该文件未被任何内容引用。删除后对象存储中的文件体将一并移除，不可恢复。
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleteBlob.isPending}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={isLoading || hasRefs || deleteBlob.isPending}
            onClick={handleDelete}
          >
            {deleteBlob.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
