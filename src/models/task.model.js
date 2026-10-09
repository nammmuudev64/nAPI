const { getPool, sql } = require('../config/db');

/**
 * Tasks model
 *
 * Relationships:
 *   tasks.created_by  → users(id)   — who created the task
 *   tasks.assigned_to → users(id)   — who the task is assigned to (nullable)
 *
 * One user can have many tasks as owner AND/OR as assignee.
 */

// JOIN both user FKs so responses include names instead of bare IDs
const SELECT_COLS = `
  t.id,
  t.title,
  t.category,
  t.done,
  t.created_by,
  creator.name   AS created_by_name,
  creator.email  AS created_by_email,
  t.assigned_to,
  assignee.name  AS assigned_to_name,
  assignee.email AS assigned_to_email,
  t.created_at,
  t.updated_at
`;

const FROM_JOIN = `
  FROM tasks t
  INNER JOIN users creator  ON creator.id  = t.created_by
  LEFT  JOIN users assignee ON assignee.id = t.assigned_to
`;

const VALID_CATEGORIES = [
  'General', 'React basics', 'Forms', 'Browser APIs', 'Components',
  'Backend', 'Database', 'DevOps', 'Design', 'Testing', 'Documentation',
];

const TaskModel = {

  /**
   * Get all tasks with optional filters.
   * @param {object} opts
   * @param {number}  opts.created_by   – filter by owner user id
   * @param {number}  opts.assigned_to  – filter by assignee user id
   * @param {string}  opts.category     – filter by category
   * @param {boolean} opts.done         – filter by completion (true/false)
   * @param {string}  opts.search       – search in title
   */
  async findAll({ created_by, assigned_to, category, done, search } = {}) {
    const pool = await getPool();
    const req  = pool.request();
    const conditions = [];

    if (created_by !== undefined) {
      req.input('created_by', sql.Int, parseInt(created_by));
      conditions.push('t.created_by = @created_by');
    }
    if (assigned_to !== undefined) {
      req.input('assigned_to', sql.Int, parseInt(assigned_to));
      conditions.push('t.assigned_to = @assigned_to');
    }
    if (category) {
      req.input('category', sql.NVarChar(100), category);
      conditions.push('t.category = @category');
    }
    if (done !== undefined) {
      req.input('done', sql.Bit, done ? 1 : 0);
      conditions.push('t.done = @done');
    }
    if (search) {
      req.input('search', sql.NVarChar(200), `%${search}%`);
      conditions.push('t.title LIKE @search');
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await req.query(
      `SELECT ${SELECT_COLS} ${FROM_JOIN} ${where} ORDER BY t.created_at DESC`
    );
    return result.recordset;
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE t.id = @id`);
    return result.recordset[0] || null;
  },

  /**
   * Get all tasks belonging to or assigned to a specific user.
   * Useful for the "my tasks" view.
   */
  async findByUserId(userId) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('user_id', sql.Int, parseInt(userId))
      .query(`
        SELECT ${SELECT_COLS} ${FROM_JOIN}
        WHERE t.created_by = @user_id OR t.assigned_to = @user_id
        ORDER BY t.done ASC, t.created_at DESC
      `);
    return result.recordset;
  },

  async create({ title, category, done, created_by, assigned_to }) {
    const pool   = await getPool();
    const result = await pool
      .request()
      .input('title',       sql.NVarChar(200), title)
      .input('category',    sql.NVarChar(100), category    || 'General')
      .input('done',        sql.Bit,           done ? 1 : 0)
      .input('created_by',  sql.Int,           parseInt(created_by))
      .input('assigned_to', sql.Int,           assigned_to ? parseInt(assigned_to) : null)
      .query(`
        INSERT INTO tasks (title, category, done, created_by, assigned_to)
        OUTPUT INSERTED.id
        VALUES (@title, @category, @done, @created_by, @assigned_to)
      `);
    return this.findById(result.recordset[0].id);
  },

  async update(id, { title, category, done, assigned_to }) {
    const pool = await getPool();
    const req  = pool.request().input('id', sql.Int, parseInt(id));
    const set  = [];

    if (title       !== undefined) { req.input('title',       sql.NVarChar(200), title);                   set.push('title = @title'); }
    if (category    !== undefined) { req.input('category',    sql.NVarChar(100), category);                set.push('category = @category'); }
    if (done        !== undefined) { req.input('done',        sql.Bit,           done ? 1 : 0);            set.push('done = @done'); }
    if (assigned_to !== undefined) { req.input('assigned_to', sql.Int,           assigned_to ? parseInt(assigned_to) : null); set.push('assigned_to = @assigned_to'); }

    if (set.length === 0) return this.findById(id);

    set.push('updated_at = GETDATE()');
    await req.query(`UPDATE tasks SET ${set.join(', ')} WHERE id = @id`);
    return this.findById(id);
  },

  // Toggle done ↔ not done
  async toggleDone(id) {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, parseInt(id))
      .query('UPDATE tasks SET done = 1 - done, updated_at = GETDATE() WHERE id = @id');
    return this.findById(id);
  },

  async delete(id) {
    const pool   = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id))
      .query('DELETE FROM tasks WHERE id = @id');
    return result.rowsAffected[0] > 0;
  },

  // Bulk delete all completed tasks owned by a user
  async deleteCompletedByUser(userId) {
    const pool   = await getPool();
    const result = await pool
      .request()
      .input('user_id', sql.Int, parseInt(userId))
      .query('DELETE FROM tasks WHERE created_by = @user_id AND done = 1');
    return result.rowsAffected[0];
  },

  // Stats for a user: total, done, pending, by category
  async statsForUser(userId) {
    const pool   = await getPool();
    const result = await pool
      .request()
      .input('user_id', sql.Int, parseInt(userId))
      .query(`
        SELECT
          COUNT(*)                                   AS total,
          SUM(CAST(done AS INT))                     AS completed,
          SUM(1 - CAST(done AS INT))                 AS pending,
          category
        FROM tasks
        WHERE created_by = @user_id OR assigned_to = @user_id
        GROUP BY category
        ORDER BY category
      `);
    return result.recordset;
  },

  get validCategories() { return VALID_CATEGORIES; },
};

module.exports = TaskModel;
