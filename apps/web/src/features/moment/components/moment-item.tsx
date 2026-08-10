import { Clock, MapPin, MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@/lib/format'
import {
  useCreateMomentComment,
  useDeleteMoment,
  useMomentComments,
} from '@/features/moment/queries'
import type { MomentEntry, MomentLocation } from '@/features/moment/api'
import { formatLocationLabel, locationAmapUrl } from '@/features/location/format'
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
import { MomentAttachmentGrid } from './moment-attachment-grid'
import { MomentCommentList } from './moment-comment-list'
import { MomentCommentsDialog } from './moment-comments-dialog'

interface MomentItemProps {
  moment: MomentEntry
}

const TEXT_TRUNCATE = 150
// 卡片内联展示前 N 条评论，其余进「查看全部」对话框。
const INLINE_COMMENTS = 3

// 单条闪记卡片：文字（超长截断，全文/收起在正文下方）+ 附件网格 + 时间/字数 + 评论 + 删除。
export function MomentItem({ moment }: MomentItemProps) {
  const { mutate: deleteMoment } = useDeleteMoment()
  const { mutate: createComment } = useCreateMomentComment()
  const [textExpanded, setTextExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false)

  // 列表接口不内嵌评论体，有评论时才惰性拉取；对话框复用同一份数据。
  const { data: comments } = useMomentComments(moment.id, moment.commentCount > 0)

  const showToggle = moment.text.length > TEXT_TRUNCATE
  const text = showToggle && !textExpanded ? moment.text.slice(0, TEXT_TRUNCATE) + '…' : moment.text

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

      <MomentCommentsDialog
        open={commentsDialogOpen}
        onOpenChange={setCommentsDialogOpen}
        comments={comments}
        commentCount={moment.commentCount}
      />
    </div>
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
