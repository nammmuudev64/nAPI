const TaskModel = require('../models/task.model');

/**
 * GET /api/tasks
 * Query: ?created_by=&assigned_to=&category=&done=true|false&search=
 *
 * Role rules:
 *   Admin    — sees ALL tasks (no filter forced)
 *   Employee — sees only tasks they own or are assigned to
 *   OtherUser— sees only tasks they own or are assigned to
 */
const getAllTasks = async (req, res, next) => {
  try {
    let { created_by, assigned_to, category, done, search } = req.query;

    // Non-admins are silently scoped to their own tasks
    if (req.user.role !== 'Admin') {
      // Return tasks where user is owner OR assignee
      const tasks = await TaskModel.findByUserId(req.user.id);

      // Still allow client-side filtering on top
      let filtered = tasks;
      if (category)  filtered = filtered.filter(t => t.category === category);
      if (search)    filtered = filtered.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
      if (done !== undefined) {
        const isDone = done === 'true' || done === '1';
        filtered = filtered.filter(t => Boolean(t.done) === isDone);
      }
      return res.json({ success: true, count: filtered.length, data: filtered });
    }

    // Admin path — pass all filters to DB
    const doneFilter = done !== undefined ? (done === 'true' || done === '1') : undefined;
    const tasks = await TaskModel.findAll({
      created_by: created_by ? parseInt(created_by) : undefined,
      assigned_to: assigned_to ? parseInt(assigned_to) : undefined,
      category,
      done: doneFilter,
      search,
    });
    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tasks/me
 * Returns all tasks owned by or assigned to the currently logged-in user.
 */
const getMyTasks = async (req, res, next) => {
  try {
    const tasks = await TaskModel.findByUserId(req.user.id);
    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tasks/me/stats
 * Returns task stats (total, completed, pending, by category) for the current user.
 */
const getMyStats = async (req, res, next) => {
  try {
    const rows = await TaskModel.statsForUser(req.user.id);
    const total     = rows.reduce((s, r) => s + Number(r.total),     0);
    const completed = rows.reduce((s, r) => s + Number(r.completed), 0);
    const pending   = rows.reduce((s, r) => s + Number(r.pending),   0);
    res.json({
      success: true,
      data: {
        total,
        completed,
        pending,
        by_category: rows.map(r => ({
          category:  r.category,
          total:     Number(r.total),
          completed: Number(r.completed),
          pending:   Number(r.pending),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tasks/categories
 * Returns the list of valid category values.
 */
const getCategories = async (req, res) => {
  res.json({ success: true, data: TaskModel.validCategories });
};

/**
 * GET /api/tasks/:id
 * Admin sees any task; others can only see tasks they own or are assigned to.
 */
const getTaskById = async (req, res, next) => {
  try {
    const task = await TaskModel.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    if (req.user.role !== 'Admin' &&
        req.user.id !== task.created_by &&
        req.user.id !== task.assigned_to) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tasks
 * Body: { title*, category?, done?, assigned_to? }
 * created_by is always the logged-in user.
 * Admin can create tasks and assign them to any user.
 */
const createTask = async (req, res, next) => {
  try {
    const { title, category, done, assigned_to } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'title is required.' });
    }

    // Only Admin can assign tasks to other users
    let assignTo = null;
    if (assigned_to) {
      if (req.user.role !== 'Admin') {
        return res.status(403).json({ success: false, message: 'Only Admin can assign tasks to other users.' });
      }
      assignTo = parseInt(assigned_to);
    }

    const task = await TaskModel.create({
      title:       String(title).trim(),
      category:    category || 'General',
      done:        done === true || done === 'true' || done === 1,
      created_by:  req.user.id,
      assigned_to: assignTo,
    });

    res.status(201).json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/tasks/:id
 * Body: { title?, category?, done?, assigned_to? }
 * Admin can update any task.
 * Others can only update tasks they own.
 */
const updateTask = async (req, res, next) => {
  try {
    const task = await TaskModel.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    if (req.user.role !== 'Admin' && req.user.id !== task.created_by) {
      return res.status(403).json({ success: false, message: 'Access denied. You can only edit your own tasks.' });
    }

    const { title, category, done, assigned_to } = req.body;

    // Only Admin can reassign tasks
    if (assigned_to !== undefined && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only Admin can reassign tasks.' });
    }

    const updated = await TaskModel.update(req.params.id, {
      title:       title       !== undefined ? String(title).trim() : undefined,
      category:    category    !== undefined ? category             : undefined,
      done:        done        !== undefined ? (done === true || done === 'true' || done === 1) : undefined,
      assigned_to: assigned_to !== undefined ? (assigned_to ? parseInt(assigned_to) : null) : undefined,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/tasks/:id/toggle
 * Toggles the done flag. Owner or assignee can toggle their own tasks.
 */
const toggleTask = async (req, res, next) => {
  try {
    const task = await TaskModel.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    if (req.user.role !== 'Admin' &&
        req.user.id !== task.created_by &&
        req.user.id !== task.assigned_to) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const updated = await TaskModel.toggleDone(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/tasks/:id
 * Admin can delete any task; owner can delete their own.
 */
const deleteTask = async (req, res, next) => {
  try {
    const task = await TaskModel.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    if (req.user.role !== 'Admin' && req.user.id !== task.created_by) {
      return res.status(403).json({ success: false, message: 'Access denied. You can only delete your own tasks.' });
    }

    await TaskModel.delete(req.params.id);
    res.json({ success: true, message: 'Task deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/tasks/me/completed
 * Deletes all completed tasks owned by the current user.
 */
const deleteMyCompleted = async (req, res, next) => {
  try {
    const count = await TaskModel.deleteCompletedByUser(req.user.id);
    res.json({ success: true, message: `${count} completed task(s) deleted.` });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
