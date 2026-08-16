import { Hono } from 'hono'
import { habitHandler } from '@/modules/habit/habit.handler'

// ---------------------------------------------------------------------------
// Habit router — RESTful routes mounted under /api
// ---------------------------------------------------------------------------

export const habitRouter = new Hono()
  .get('/habits', habitHandler.listHabits)
  .post('/habits', habitHandler.createHabit)
  .put('/habits/:id', habitHandler.updateHabit)
  .delete('/habits/:id', habitHandler.deleteHabit)
  .get('/habit-daily', habitHandler.listDaily)
  .get('/habit-daily/overview', habitHandler.overview)
  .put('/habits/:habitId/daily/:date', habitHandler.setDaily)
  .delete('/habits/:habitId/daily/:date', habitHandler.clearDaily)
