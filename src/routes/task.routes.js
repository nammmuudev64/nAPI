const express  = require('express');
const router   = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/auth');
const {
  getAllTasks,
  getMyTasks,
  getMyStats,
  getCategories,
  getTaskById,
  createTask,
  updateTask,
  toggleTask,
  deleteTask,
  deleteMyCompleted,
} = require('../controllers/task.controller');

// All task routes require a valid JWT
router.use(verifyToken);

/**
 * Static / "me" routes MUST be declared before /:id routes
 * to avoid Express treating "me", "stats", "categories" as an id parameter.
 *
 * GET  /api/tasks/categories          — list valid categories        (all)
 * GET  /api/tasks/me                  — my tasks (owned + assigned)  (all)
 * GET  /api/tasks/me/stats            — my task stats                (all)
 * DELETE /api/tasks/me/completed      — delete my completed tasks    (all)
 *
 * GET  /api/tasks                     — all tasks (Admin: all | others: own) (all)
 *   ?created_by=&assigned_to=&category=&done=&search=
 *
 * GET    /api/tasks/:id               — get one task                 (all)
 * POST   /api/tasks                   — create a task                (all)
 * PUT    /api/tasks/:id               — full/partial update          (Admin | owner)
 * PATCH  /api/tasks/:id/toggle        — toggle done flag             (Admin | owner | assignee)
 * DELETE /api/tasks/:id               — delete a task                (Admin | owner)
 */

router.get('/categories',      getCategories);
router.get('/me',              getMyTasks);
router.get('/me/stats',        getMyStats);
router.delete('/me/completed', deleteMyCompleted);

router.get('/',    getAllTasks);
router.get('/:id', getTaskById);
router.post('/',   createTask);
router.put('/:id', updateTask);
router.patch('/:id/toggle', toggleTask);
router.delete('/:id', deleteTask);

module.exports = router;
