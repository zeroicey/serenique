import { useState } from 'react'
import { KeyRound, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { toDisplayError } from '@/api/errors'
import { formatDate } from '@/lib/format'
import {
  useCredentials,
  useDeleteCredential,
  useRegister,
  useRenameCredential,
} from '@/features/auth/queries'

// 登录凭证管理：列出已注册的通行密钥，支持重命名（PATCH /auth/credentials/:id）、
// 删除（删最后一把 409 由服务端文案提示）与登录态添加新设备（不带 setupToken
// 的注册 ceremony）。
export function CredentialsSection() {
  const { data: credentials, isPending, isError, refetch } = useCredentials()
  const deleteCredential = useDeleteCredential()
  const register = useRegister()
  const renameCredential = useRenameCredential()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const pendingDelete = credentials?.find((c) => c.id === confirmId) ?? null
  const pendingRename = credentials?.find((c) => c.id === renameTarget) ?? null

  async function handleAddDevice() {
    try {
      await register.mutateAsync({})
      toast.success('登录凭证添加成功')
    } catch (e) {
      toast.error(toDisplayError(e).message)
    }
  }

  async function handleRename() {
    if (!renameTarget) return
    try {
      await renameCredential.mutateAsync({
        id: renameTarget,
        deviceLabel: renameValue.trim() || null,
      })
      setRenameTarget(null)
      setRenameValue('')
    } catch {
      // toast 已由 mutation onError 弹出
    }
  }

  if (isPending) {
    return <p className="py-8 text-center text-sm text-muted-foreground">加载登录凭证中…</p>
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="text-sm text-muted-foreground">加载登录凭证失败</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const items = credentials ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">共 {items.length} 把登录凭证，删除前请确认至少保留一把。</p>
        <Button size="sm" onClick={handleAddDevice} disabled={register.isPending}>
          <KeyRound />
          {register.isPending ? '正在创建通行密钥…' : '添加新设备'}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无登录凭证</p>
      ) : (
        <ul className="space-y-2">
          {items.map((cred) => (
            <li
              key={cred.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{cred.deviceLabel ?? '未命名设备'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  添加于 {formatDate(cred.createdAt)}
                  {cred.lastUsedAt ? ` · 最近使用 ${formatDate(cred.lastUsedAt)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`重命名凭证 ${cred.deviceLabel ?? '未命名设备'}`}
                  onClick={() => {
                    setRenameTarget(cred.id)
                    setRenameValue(cred.deviceLabel ?? '')
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除凭证 ${cred.deviceLabel ?? '未命名设备'}`}
                  onClick={() => setConfirmId(cred.id)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="删除登录凭证"
        description={`确定删除「${pendingDelete?.deviceLabel ?? '未命名设备'}」吗？删除后该设备将无法再用此通行密钥登录。`}
        confirmText="删除"
        destructive
        onConfirm={() => {
          if (confirmId) deleteCredential.mutate(confirmId)
        }}
      />

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null)
            setRenameValue('')
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名登录凭证</DialogTitle>
            <DialogDescription>
              给「{pendingRename?.deviceLabel ?? '未命名设备'}」起个一眼能认出的名字（如
              iPhone · Apple / MacBook）。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            maxLength={50}
            placeholder="例如：iPhone · Apple"
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button onClick={handleRename} disabled={renameCredential.isPending}>
              {renameCredential.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
