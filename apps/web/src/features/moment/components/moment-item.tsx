import { Clock, MapPin, MessageCircle, MoreHorizontal, Tag as TagIcon, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { MomentEntry, MomentLocation } from '@/features/moment/api'
import {
  useCreateMomentComment,
  useDeleteMoment,
  useMomentComments,
  useReplaceMomentTags,
} from '@/features/moment/queries'
import { TagPicker } from '@/features/tag/components/tag-picker'
import { useTags } from '@/features/tag/queries'
import { formatDate } from '@/lib/format'
import { formatLocationLabel, locationAmapUrl } from '@/lib/location'
import { MomentAttachmentGrid } from './moment-attachment-grid'
import { MomentCommentList } from './moment-comment-list'
import { MomentCommentsDialog } from './moment-comments-dialog'

interface MomentItemProps {
  moment: MomentEntry
}

const TEXT_TRUNCATE = 150
// 卡片内联展示前 N 条评论，其余进「查看全部」对话框。
const INLINE_COMMENTS = 3

// 单条闪记卡片：文字（超长截断，全文/收起在正文下方）+ 附件网格 + 标签 + 位置 + 时间/字数 + 评论 + 删除。
export function MomentItem({ moment }: MomentItemProps) {
  const navigate = useNavigate()
  const { mutate: deleteMoment } = useDeleteMoment()
  const { mutate: createComment } = useCreateMomentComment()
  const [textExpanded, setTextExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false)
  const [editTagsOpen, setEditTagsOpen] = useState(false)

  // 列表接口不内嵌评论体，有评论时才惰性拉取；对话框复用同一份数据。
  const { data: comments } = useMomentComments(moment.id, moment.commentCount > 0)

  const showToggle = moment.text.length > TEXT_TRUNCATE
  const text = showToggle && !textExpanded ? `${moment.text.slice(0, TEXT_TRUNCATE)}…` : moment.text

  const inlineComments = (comments ?? []).slice(0, INLINE_COMMENTS)
  const hasMoreComments = moment.commentCount > INLINE_COMMENTS

  const submitComment = () => {
    const content = commentText.trim()
    if (!content) return
    createComment(
      { momentId: moment.id, content },
      {
        onSuccess: () => {
          setCommentText('')
          setCommentOpen(false)
        },
      },
    )
  }

  return (
    <div className="flex w-full max-w-[600px] flex-col gap-2 px-3">
      <div className="text-base">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {/* 全文/收起放正文下方（对齐移动端），时间行只留时间 + ⋮ 菜单。 */}
        {showToggle && (
          <button
            type="button"
            className="mt-1 cursor-pointer text-sm text-blue-600 hover:underline"
            onClick={() => setTextExpanded((v) => !v)}
          >
            {textExpanded ? '收起' : '全文'}
          </button>
        )}
      </div>

      <MomentAttachmentGrid attachments={moment.attachments} />

      {moment.location && <MomentLocationLine location={moment.location} />}

      {moment.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {moment.tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className="cursor-pointer rounded-full bg-primary/10 px-2.5 py-0.5 text-xs transition-colors hover:bg-primary/20"
              onClick={() => navigate(`/moment?tag=${t.id}`)}
            >
              #{t.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock size={14} strokeWidth={1.8} />
          <span>{formatDate(moment.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{moment.text.length} 字</span>
          {moment.commentCount > 0 && (
            <button
              className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-accent"
              onClick={() => setCommentOpen((v) => !v)}
            >
              <MessageCircle size={14} />
              <span>{moment.commentCount} 条评论</span>
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-accent">
              <MoreHorizontal size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => {
                  setCommentOpen(true)
                }}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                评论
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setEditTagsOpen(true)}>
                <TagIcon className="mr-2 h-4 w-4" />
                编辑标签
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-red-600 focus:text-red-600"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 评论区：有评论或正在输入时展示 */}
      {(moment.commentCount > 0 || commentOpen) && (
        <div className="mt-1 space-y-2 border-t pt-2">
          {moment.commentCount > 0 && (
            <>
              <MomentCommentList comments={inlineComments} />
              {hasMoreComments && (
                <button
                  className="cursor-pointer text-sm text-blue-600 hover:underline"
                  onClick={() => setCommentsDialogOpen(true)}
                >
                  查看全部 {moment.commentCount} 条评论
                </button>
              )}
            </>
          )}

          {commentOpen && (
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="写条评论…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitComment()
                  }
                }}
                className="flex-1 text-sm"
              />
              <Button size="sm" onClick={submitComment} disabled={!commentText.trim()}>
                发送
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除闪记</DialogTitle>
            <DialogDescription>确定删除这条闪记吗？删除后不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMoment(moment.id)
                setDeleteOpen(false)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TagEditDialog
        open={editTagsOpen}
        onOpenChange={setEditTagsOpen}
        momentId={moment.id}
        initialTagIds={moment.tags.map((t) => t.id)}
      />

      <MomentCommentsDialog
        open={commentsDialogOpen}
        onOpenChange={setCommentsDialogOpen}
        comments={comments}
        commentCount={moment.commentCount}
      />
    </div>
  )
}

// 编辑标签弹窗：只选已有标签（TagPicker）+ PUT 整体替换保存。
interface TagEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  momentId: string
  initialTagIds: string[]
}

function TagEditDialog({ open, onOpenChange, momentId, initialTagIds }: TagEditDialogProps) {
  const { data: tags } = useTags()
  const { mutate: updateTags, isPending } = useReplaceMomentTags()
  const [selected, setSelected] = useState<string[]>(initialTagIds)

  // Dialog 常驻（open 只控制显隐），首挂载之外还需在每次打开时用最新 initialTagIds
  // 重置 selected，否则关闭后残留未保存的修改会带到下次编辑，误改标签。
  useEffect(() => {
    if (open) setSelected(initialTagIds)
  }, [open, initialTagIds])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑标签</DialogTitle>
        </DialogHeader>
        <TagPicker tags={tags ?? []} selectedIds={selected} onChange={setSelected} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={isPending}
            onClick={() =>
              updateTags({ momentId, tagIds: selected }, { onSuccess: () => onOpenChange(false) })
            }
          >
            {isPending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 位置行：附件网格与元信息行之间；有坐标时整行可点击打开高德深链（新窗口）。
function MomentLocationLine({ location }: { location: MomentLocation }) {
  const label = formatLocationLabel(location)
  const url = locationAmapUrl(location)
  const content = (
    <>
      <MapPin size={13} strokeWidth={1.8} />
      <span className="break-words">{label}</span>
    </>
  )
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
      >
        {content}
      </a>
    )
  }
  return <div className="flex items-center gap-1 text-xs text-muted-foreground">{content}</div>
}
