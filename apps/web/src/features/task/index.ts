// 任务 feature。对外暴露 pages 与必要 hooks / 组件（服务层细节不导出）。
export {
  listTaskGroups,
  createTaskGroup,
  updateTaskGroup,
  deleteTaskGroup,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
} from './api'
export type {
  TaskEntry,
  TaskGroupEntry,
  TaskStatus,
  CreateTaskGroupInput,
  CreateTaskInput,
} from './api'
export {
  useTaskGroups,
  useTasks,
  useCreateTaskGroup,
  useUpdateTaskGroup,
  useDeleteTaskGroup,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from './queries'
export { taskGroupFormSchema, taskFormSchema } from './schemas'
export type { TaskGroupFormValues, TaskFormValues } from './schemas'
export { taskStatusLabel, sortTasks } from './lib'
export { TaskNav } from './components/task-nav'
