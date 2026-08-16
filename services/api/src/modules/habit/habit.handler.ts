import type { Context } from 'hono'
import { habitService } from '@/modules/habit/habit.service'
import {
  CreateHabitSchema,
  DailyDateSchema,
  ListDailySchema,
  OverviewSchema,
  SetDailySchema,
  UpdateHabitSchema,
} from '@/modules/habit/habit.types'
import { handleError, uuidParam } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Habit handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

export const habitHandler = {
  // ---- Habit options ----

  async createHabit(c: Context) {
    try {
      const body = CreateHabitSchema.parse(await c.req.json())
      const result = await habitService.createHabit(body)
      return Res.created('习惯创建成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },

  async listHabits(c: Context) {
    try {
      const result = await habitService.listHabits()
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },

  async updateHabit(c: Context) {
    try {
      const body = UpdateHabitSchema.parse(await c.req.json())
      const result = await habitService.updateHabit({ id: uuidParam(c, 'id'), ...body })
      return Res.ok('习惯更新成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },

  async deleteHabit(c: Context) {
    try {
      await habitService.deleteHabit({ id: uuidParam(c, 'id') })
      return Res.noContent('习惯删除成功').build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },

  // ---- Daily records ----

  async listDaily(c: Context) {
    try {
      const query = ListDailySchema.parse(c.req.query())
      const result = await habitService.listDaily(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },

  async setDaily(c: Context) {
    try {
      const body = SetDailySchema.parse(await c.req.json())
      const date = DailyDateSchema.parse(c.req.param('date'))
      const result = await habitService.setDaily({
        habitId: uuidParam(c, 'habitId'),
        date,
        ...body,
      })
      return Res.ok('记录成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },

  async clearDaily(c: Context) {
    try {
      const date = DailyDateSchema.parse(c.req.param('date'))
      await habitService.clearDaily({ habitId: uuidParam(c, 'habitId'), date })
      return Res.noContent('记录已清除').build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },

  // ---- Overview ----

  async overview(c: Context) {
    try {
      const query = OverviewSchema.parse(c.req.query())
      const result = await habitService.overview(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'habit')
    }
  },
}
