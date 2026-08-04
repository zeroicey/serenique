import { Hono } from "hono";
import { taskHandler } from "@/modules/task/task.handler";

// ---------------------------------------------------------------------------
// Task router — RESTful routes mounted under /api/task-groups and /api/tasks
// ---------------------------------------------------------------------------

export const taskRouter = new Hono()
  .get("/task-groups", taskHandler.listTaskGroups)
  .post("/task-groups", taskHandler.createTaskGroup)
  .get("/task-groups/:id", taskHandler.getTaskGroup)
  .put("/task-groups/:id", taskHandler.updateTaskGroup)
  .delete("/task-groups/:id", taskHandler.deleteTaskGroup)
  .get("/tasks", taskHandler.listTasks)
  .post("/tasks", taskHandler.createTask)
  .get("/tasks/:id", taskHandler.getTask)
  .put("/tasks/:id", taskHandler.updateTask)
  .delete("/tasks/:id", taskHandler.deleteTask);
