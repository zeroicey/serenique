import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { MomentCommentEntry } from '@/features/moment/api'
import { MomentCommentList } from './moment-comment-list'

interface MomentCommentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  comments: MomentCommentEntry[] | undefined
  commentCount: number
  onDelete?: (commentId: string) => void
}

// 查看全部评论对话框：复用评论列表，支持删除。
export function MomentCommentsDialog({
  open,
  onOpenChange,
  comments,
  commentCount,
  onDelete,
}: MomentCommentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>全部评论（{commentCount}）</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {comments && comments.length > 0 ? (
            <MomentCommentList comments={comments} onDelete={onDelete} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {comments ? '还没有评论' : '加载中…'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
