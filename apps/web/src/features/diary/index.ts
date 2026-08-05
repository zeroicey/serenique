// 日记 feature。对外只暴露 pages 与必要 hooks（服务层细节不导出）。
export { listDiaries, getDiaryByDate, createDiary, updateDiary, deleteDiary } from './api'
export type { DiaryEntry, CreateDiaryInput, UpdateDiaryInput } from './api'
export {
  useDiaries,
  useDiaryByDate,
  useCreateDiary,
  useUpdateDiary,
  useDeleteDiary,
} from './queries'
export { diaryFormSchema } from './schemas'
export type { DiaryFormValues } from './schemas'
export { DiaryNav } from './components/diary-nav'
export { DiaryCreateNav } from './components/diary-create-nav'
