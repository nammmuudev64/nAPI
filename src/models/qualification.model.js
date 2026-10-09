const { getPool, sql } = require("../config/db");

/**
 * employee_qualifications.user_id is a FK → users(id).
 * All reads JOIN users so the response includes the user's name, email, role.
 */
const SELECT_COLS = `
  eq.id,
  eq.user_id,
  u.name           AS employee_name,
  u.email,
  u.role,
  u.image_url      AS user_image_url,
  eq.department,
  eq.designation,
  eq.degree,
  eq.specialization,
  eq.institute,
  eq.graduation_year,
  eq.score_type,
  eq.score,
  eq.course_type,
  eq.skills,
  eq.certifications,
  eq.experience_years,
  eq.status,
  eq.remarks,
  eq.resume_file_name,
  eq.resume_file_size,
  eq.resume_file_type,
  eq.resume_url,
  eq.created_at,
  eq.updated_at
`;

const FROM_JOIN = `
  FROM employee_qualifications eq
  INNER JOIN users u ON u.id = eq.user_id
`;

const VALID_STATUSES = ["Pending Verification", "Under Review", "Verified"];

const QualificationModel = {
  async findAll({ department, status, search } = {}) {
    const pool = await getPool();
    const req = pool.request();
    const conditions = [];

    if (department) {
      req.input("department", sql.NVarChar(100), department);
      conditions.push("eq.department = @department");
    }
    if (status) {
      req.input("status", sql.NVarChar(30), status);
      conditions.push("eq.status = @status");
    }
    if (search) {
      req.input("search", sql.NVarChar(200), `%${search}%`);
      conditions.push(`(
        u.name              LIKE @search OR
        u.email             LIKE @search OR
        eq.degree           LIKE @search OR
        eq.specialization   LIKE @search OR
        eq.institute        LIKE @search OR
        eq.skills           LIKE @search
      )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await req.query(
      `SELECT ${SELECT_COLS} ${FROM_JOIN} ${where} ORDER BY eq.id DESC`,
    );
    return result.recordset;
  },

  // Find by qualification record id
  async findById(id) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .query(`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE eq.id = @id`);
    return result.recordset[0] || null;
  },

  // Find by users.id (FK) — enforces one record per user
  async findByUserId(userId) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("user_id", sql.Int, parseInt(userId))
      .query(`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE eq.user_id = @user_id`);
    return result.recordset[0] || null;
  },

  async create({
    user_id,
    department,
    designation,
    degree,
    specialization,
    institute,
    graduation_year,
    score_type,
    score,
    course_type,
    skills,
    certifications,
    experience_years,
    status,
    remarks,
    resume_file_name,
    resume_file_size,
    resume_file_type,
    resume_url,
  }) {
    if (status && !VALID_STATUSES.includes(status)) {
      throw new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("user_id", sql.Int, parseInt(user_id))
      .input("department", sql.NVarChar(100), department)
      .input("designation", sql.NVarChar(150), designation)
      .input("degree", sql.NVarChar(100), degree)
      .input("specialization", sql.NVarChar(150), specialization)
      .input("institute", sql.NVarChar(200), institute)
      .input("graduation_year", sql.NVarChar(4), graduation_year)
      .input("score_type", sql.NVarChar(30), score_type)
      .input("score", sql.NVarChar(20), score)
      .input("course_type", sql.NVarChar(30), course_type || "Full-Time")
      .input("skills", sql.NVarChar(500), skills || null)
      .input("certifications", sql.NVarChar(500), certifications || null)
      .input(
        "experience_years",
        sql.Decimal(4, 1),
        experience_years ? parseFloat(experience_years) : null,
      )
      .input("status", sql.NVarChar(30), status || "Pending Verification")
      .input("remarks", sql.NVarChar(500), remarks || null)
      .input("resume_file_name", sql.NVarChar(255), resume_file_name || null)
      .input(
        "resume_file_size",
        sql.Int,
        resume_file_size ? parseInt(resume_file_size) : null,
      )
      .input("resume_file_type", sql.NVarChar(100), resume_file_type || null)
      .input("resume_url", sql.NVarChar(500), resume_url || null).query(`
        INSERT INTO employee_qualifications (
          user_id, department, designation,
          degree, specialization, institute, graduation_year,
          score_type, score, course_type,
          skills, certifications, experience_years,
          status, remarks,
          resume_file_name, resume_file_size, resume_file_type, resume_url
        )
        OUTPUT INSERTED.id
        VALUES (
          @user_id, @department, @designation,
          @degree, @specialization, @institute, @graduation_year,
          @score_type, @score, @course_type,
          @skills, @certifications, @experience_years,
          @status, @remarks,
          @resume_file_name, @resume_file_size, @resume_file_type, @resume_url
        )
      `);

    return this.findById(result.recordset[0].id);
  },

  async update(id, fields) {
    if (fields.status && !VALID_STATUSES.includes(fields.status)) {
      throw new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const pool = await getPool();
    const req = pool.request().input("id", sql.Int, parseInt(id));
    const set = [];

    const map = {
      department: [sql.NVarChar(100), null],
      designation: [sql.NVarChar(150), null],
      degree: [sql.NVarChar(100), null],
      specialization: [sql.NVarChar(150), null],
      institute: [sql.NVarChar(200), null],
      graduation_year: [sql.NVarChar(4), null],
      score_type: [sql.NVarChar(30), null],
      score: [sql.NVarChar(20), null],
      course_type: [sql.NVarChar(30), null],
      skills: [sql.NVarChar(500), null],
      certifications: [sql.NVarChar(500), null],
      experience_years: [sql.Decimal(4, 1), (v) => parseFloat(v)],
      status: [sql.NVarChar(30), null],
      remarks: [sql.NVarChar(500), null],
      resume_file_name: [sql.NVarChar(255), null],
      resume_file_size: [sql.Int, (v) => parseInt(v)],
      resume_file_type: [sql.NVarChar(100), null],
      resume_url: [sql.NVarChar(500), null],
    };

    for (const [field, [type, transform]] of Object.entries(map)) {
      if (fields[field] !== undefined) {
        req.input(
          field,
          type,
          transform ? transform(fields[field]) : fields[field],
        );
        set.push(`${field} = @${field}`);
      }
    }

    if (set.length === 0) return this.findById(id);

    set.push("updated_at = GETDATE()");
    await req.query(
      `UPDATE employee_qualifications SET ${set.join(", ")} WHERE id = @id`,
    );
    return this.findById(id);
  },

  async delete(id) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .query("DELETE FROM employee_qualifications WHERE id = @id");
    return result.rowsAffected[0] > 0;
  },
};

module.exports = QualificationModel;
