import type { Context } from "hono";
import { z } from "zod";
import { taskService } from "@/modules/task/task.service";
import {
  CreateTaskGroupSchema,
  CreateTaskSchema,
  ListTaskGroupSchema,
  ListTaskSchema,
  UpdateTaskGroupSchema,
  UpdateTaskSchema,
} from "@/modules/task/task.types";
import { handleError } from "@/shared/handler";
import { Res } from "@/shared/response";
import { AppError } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Task handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

const UuidParamSchema = z.string().uuid();

function getId(c: Context): string {
  const id = c.req.param("id");
  if (!id) throw new AppError("VALIDATION", "缺少 id 参数", 400);
  return UuidParamSchema.parse(id);
}

export const taskHandler = {
  // ---- Task groups ----

  async createTaskGroup(c: Context) {
    try {
      const body = CreateTaskGroupSchema.parse(await c.req.json());
      const result = await taskService.createTaskGroup(body);
      return Res.created("任务组创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async listTaskGroups(c: Context) {
    try {
      const query = ListTaskGroupSchema.parse(c.req.query());
      const result = await taskService.listTaskGroups(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async getTaskGroup(c: Context) {
    try {
      const result = await taskService.getTaskGroup({ id: getId(c) });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async updateTaskGroup(c: Context) {
    try {
      const body = UpdateTaskGroupSchema.parse(await c.req.json());
      const result = await taskService.updateTaskGroup({ id: getId(c), ...body });
      return Res.ok("任务组更新成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async deleteTaskGroup(c: Context) {
    try {
      await taskService.deleteTaskGroup({ id: getId(c) });
      return Res.noContent("任务组删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  // ---- Tasks ----

  async createTask(c: Context) {
    try {
      const body = CreateTaskSchema.parse(await c.req.json());
      const result = await taskService.createTask(body);
      return Res.created("任务创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async listTasks(c: Context) {
    try {
      const query = ListTaskSchema.parse(c.req.query());
      const result = await taskService.listTasks(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async getTask(c: Context) {
    try {
      const result = await taskService.getTask({ id: getId(c) });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async updateTask(c: Context) {
    try {
      const body = UpdateTaskSchema.parse(await c.req.json());
      const result = await taskService.updateTask({ id: getId(c), ...body });
      return Res.ok("任务更新成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },

  async deleteTask(c: Context) {
    try {
      await taskService.deleteTask({ id: getId(c) });
      return Res.noContent("任务删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "task");
    }
  },
};
