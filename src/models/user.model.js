const { getPool, sql } = require("../config/db");

const ROLES = ["Admin", "Employee", "OtherUser"];

const UserModel = {
  // ── Internal select (includes password for auth) ──────────────────────────
  async findByEmailWithPassword(email) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("email", sql.NVarChar(150), email)
      .query("SELECT * FROM users WHERE email = @email");
    return result.recordset[0] || null;
  },

  // ── Public selects (no password) ─────────────────────────────────────────
  async findAll() {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(
        "SELECT id, name, email, role, age, image_url, created_at, updated_at FROM users ORDER BY id",
      );
    return result.recordset;
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .query(
        "SELECT id, name, email, role, age, image_url, created_at, updated_at FROM users WHERE id = @id",
      );
    return result.recordset[0] || null;
  },

  async findByEmail(email) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("email", sql.NVarChar(150), email)
      .query(
        "SELECT id, name, email, role, age, image_url, created_at, updated_at FROM users WHERE email = @email",
      );
    return result.recordset[0] || null;
  },

  // Returns the first Admin user found, or null if none exists yet
  async findFirstAdmin() {
    const pool = await getPool();
    const result = await pool
      .request()
      .query("SELECT TOP 1 id FROM users WHERE role = 'Admin'");
    return result.recordset[0] || null;
  },

  // ── Write operations ──────────────────────────────────────────────────────
  async create({ name, email, password, role = "OtherUser", age, image_url }) {
    if (!ROLES.includes(role))
      throw new Error(`Invalid role. Must be one of: ${ROLES.join(", ")}`);

    const pool = await getPool();
    const result = await pool
      .request()
      .input("name", sql.NVarChar(100), name)
      .input("email", sql.NVarChar(150), email)
      .input("password", sql.NVarChar(255), password)
      .input("role", sql.NVarChar(20), role)
      .input("age", sql.Int, age ?? null)
      .input("image_url", sql.NVarChar(500), image_url ?? null).query(`
        INSERT INTO users (name, email, password, role, age, image_url)
        OUTPUT INSERTED.id
        VALUES (@name, @email, @password, @role, @age, @image_url)
      `);
    return this.findById(result.recordset[0].id);
  },

  async update(id, { name, email, role, age, image_url }) {
    if (role !== undefined && !ROLES.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${ROLES.join(", ")}`);
    }

    const pool = await getPool();
    const req = pool.request().input("id", sql.Int, parseInt(id));
    const set = [];

    if (name !== undefined) {
      req.input("name", sql.NVarChar(100), name);
      set.push("name = @name");
    }
    if (email !== undefined) {
      req.input("email", sql.NVarChar(150), email);
      set.push("email = @email");
    }
    if (role !== undefined) {
      req.input("role", sql.NVarChar(20), role);
      set.push("role = @role");
    }
    if (age !== undefined) {
      req.input("age", sql.Int, age);
      set.push("age = @age");
    }
    if (image_url !== undefined) {
      req.input("image_url", sql.NVarChar(500), image_url);
      set.push("image_url = @image_url");
    }

    if (set.length === 0) return this.findById(id);

    set.push("updated_at = GETDATE()");
    await req.query(`UPDATE users SET ${set.join(", ")} WHERE id = @id`);
    return this.findById(id);
  },

  async updatePassword(id, hashedPassword) {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .input("password", sql.NVarChar(255), hashedPassword)
      .query(
        "UPDATE users SET password = @password, updated_at = GETDATE() WHERE id = @id",
      );
  },

  // Save a hashed reset token + expiry against the user row
  async saveResetToken(id, hashedToken, expiry) {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .input("token", sql.NVarChar(500), hashedToken)
      .input("expiry", sql.DateTime2, expiry)
      .query(
        "UPDATE users SET reset_token = @token, reset_token_expiry = @expiry WHERE id = @id",
      );
  },

  // Find a user whose reset_token matches AND hasn't expired
  async findByResetToken(hashedToken) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("token", sql.NVarChar(500), hashedToken)
      .query(
        "SELECT * FROM users WHERE reset_token = @token AND reset_token_expiry > GETDATE()",
      );
    return result.recordset[0] || null;
  },

  // Clear the reset token after successful password reset
  async clearResetToken(id) {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .query(
        "UPDATE users SET reset_token = NULL, reset_token_expiry = NULL, updated_at = GETDATE() WHERE id = @id",
      );
  },

  async delete(id) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .query("DELETE FROM users WHERE id = @id");
    return result.rowsAffected[0] > 0;
  },
};

module.exports = UserModel;
