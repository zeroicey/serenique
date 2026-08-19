// 任务 feature。对外暴露 pages 与必要 hooks / 组件（服务层细节不导出）。

export type {
  CreateTaskGroupInput,
  CreateTaskInput,
  TaskEntry,
  TaskGroupEntry,
  TaskStatus,
} from './api'
export {
  createTask,
  createTaskGroup,
  deleteTask,
  deleteTaskGroup,
  listTaskGroups,
  listTasks,
  updateTask,
  updateTaskGroup,
} from './api'
export { TaskGroupSwitcher } from './components/task-group-switcher'
export { sortTasks, taskStatusLabel } from './lib'
export {
  useCreateTask,
  useCreateTaskGroup,
  useDeleteTask,
  useDeleteTaskGroup,
  useTaskGroups,
  useTasks,
  useUpdateTask,
  useUpdateTaskGroup,
} from './queries'
export type { TaskFormValues, TaskGroupFormValues } from './schemas'
export { taskFormSchema, taskGroupFormSchema } from './schemas'
