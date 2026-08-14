import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, KeySquare, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/format'
import { useCreateToken, useRevokeToken, useTokens } from '../queries'

// API 令牌管理（GitHub PAT 模式）：列表（仅 prefix）/ 创建 / 撤销。
// 创建后明文仅显示一次：弹窗展示 + 复制按钮，关闭即清除内存中的明文。

const createTokenSchema = z.object({
  name: z.string().trim().min(1, '请输入令牌名称').max(100),
})

type CreateTokenFormValues = z.infer<typeof createTokenSchema>

export function TokensSection() {
  const { data: tokens, isPending, isError, refetch } = useTokens()
  const createToken = useCreateToken()
  const revokeToken = useRevokeToken()
  const [createOpen, setCreateOpen] = useState(false)
  /** 创建成功后的明文（仅内存保存一次，关闭弹窗即清空）。 */
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const pendingRevoke = tokens?.find((t) => t.id === revokeId) ?? null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTokenFormValues>({
    resolver: zodResolver(createTokenSchema),
    defaultValues: { name: '' },
  })

  const onSubmit = handleSubmit((values) => {
    createToken.mutate(values.name, {
      onSuccess: (result) => {
        setCreateOpen(false)
        reset()
        setPlaintext(result.plaintext)
      },
    })
  })

  async function handleCopy() {
    if (!plaintext) return
    try {
      await navigator.clipboard.writeText(plaintext)
      toast.success('令牌已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动选择复制')
    }
  }

  if (isPending) {
    return <p className="py-8 text-center text-sm text-muted-foreground">加载令牌中…</p>
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="text-sm text-muted-foreground">加载令牌失败</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const items = tokens ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          用于 CLI / 脚本 / 移动端的访问凭证，泄露后可在列表中单独撤销。
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          新建令牌
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无令牌</p>
      ) : (
        <ul className="space-y-2">
          {items.map((token) => {
            const revoked = Boolean(token.revokedAt)
            return (
              <li
                key={token.id}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
                  revoked ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    <KeySquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{token.name}</span>
                    {revoked && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        已撤销
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    serenique_{token.prefix}…
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    创建于 {formatDate(token.createdAt)}
                    {token.lastUsedAt ? ` · 最近使用 ${formatDate(token.lastUsedAt)}` : ''}
                    {token.revokedAt ? ` · 撤销于 ${formatDate(token.revokedAt)}` : ''}
                  </p>
                </div>
                {!revoked && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`撤销令牌 ${token.name}`}
                    onClick={() => setRevokeId(token.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* 新建令牌：输入名称 */}
      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建 API 令牌</DialogTitle>
            <DialogDescription>给令牌起一个便于识别的名字，如「我的 MacBook」。</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="token-name">令牌名称</Label>
              <Input
                id="token-name"
                placeholder="例如：macbook"
                autoFocus
                aria-invalid={!!errors.name}
                {...register('name')}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createToken.isPending}>
                {createToken.isPending ? '创建中…' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 明文仅显示一次：关闭即从内存清空 */}
      <Dialog open={plaintext !== null} onOpenChange={(open) => !open && setPlaintext(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>令牌已创建</DialogTitle>
            <DialogDescription>
              令牌明文仅显示这一次，关闭后无法再次查看。请立即复制并妥善保存。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">{plaintext}</div>
          <DialogFooter>
            <Button onClick={handleCopy}>
              <Copy />
              复制令牌
            </Button>
            <Button variant="outline" onClick={() => setPlaintext(null)}>
              我已知晓，关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 撤销确认 */}
      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(open) => !open && setRevokeId(null)}
        title="撤销 API 令牌"
        description={`确定撤销「${pendingRevoke?.name ?? ''}」吗？撤销后使用该令牌的 CLI / 脚本将立即失效。`}
        confirmText="撤销"
        destructive
        onConfirm={() => {
          if (revokeId) revokeToken.mutate(revokeId)
        }}
      />
    </div>
  )
}
