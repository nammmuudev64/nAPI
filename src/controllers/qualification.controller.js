const path = require("path");
const fs = require("fs");
const QualificationModel = require("../models/qualification.model");

// Build a public URL for a stored resume file
const resumeUrl = (req, filename) =>
  filename
    ? `${req.protocol}://${req.get("host")}/uploads/resumes/${filename}`
    : null;

// Delete a resume file from disk given its stored URL
const deleteResumeFile = (fileUrl) => {
  if (!fileUrl) return;
  const filename = path.basename(fileUrl);
  const filepath = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "resumes",
    filename,
  );
  if (fs.existsSync(filepath)) {
    try {
      fs.unlinkSync(filepath);
    } catch (_) {
      /* ignore */
    }
  }
};

/**
 * GET /api/qualifications
 * Query: ?department=Engineering&status=Verified&search=react
 * Accessible by: Admin, Employee
 */
const getAllQualifications = async (req, res, next) => {
  try {
    const { department, status, search } = req.query;
    const records = await QualificationModel.findAll({
      department,
      status,
      search,
    });
    res.json({ success: true, count: records.length, data: records });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/qualifications/:id
 * Accessible by: Admin, Employee (own record only — enforced below)
 */
const getQualificationById = async (req, res, next) => {
  try {
    const record = await QualificationModel.findById(req.params.id);
    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Qualification record not found." });
    }
    // Employee can only view their own record
    if (req.user.role === "Employee" && req.user.id !== record.user_id) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied." });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/qualifications/me
 * Returns the qualification record for the currently logged-in user.
 * Accessible by: any authenticated user
 */
const getMyQualification = async (req, res, next) => {
  try {
    const record = await QualificationModel.findByUserId(req.user.id);
    if (!record) {
      return res
        .status(404)
        .json({
          success: false,
          message: "No qualification record found for your account.",
        });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/qualifications
 * Content-Type: multipart/form-data
 *
 * user_id is taken from the JWT (req.user.id) for Employee role.
 * Admin may pass an explicit user_id in the body to create on behalf of another user.
 *
 * Required: department, designation, degree, specialization, institute,
 *           graduation_year, score_type, score
 * Optional: course_type, skills, certifications, experience_years,
 *           status, remarks, resume (file)
 */
const createQualification = async (req, res, next) => {
  try {
    // Determine target user_id
    let user_id;
    if (req.user.role === "Admin" && req.body.user_id) {
      user_id = parseInt(req.body.user_id);
    } else {
      // Employee (or Admin without explicit user_id) creates for themselves
      user_id = req.user.id;
    }

    const {
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
    } = req.body;

    // Required field validation
    const required = {
      department,
      designation,
      degree,
      specialization,
      institute,
      graduation_year,
      score_type,
      score,
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v || !String(v).trim())
      .map(([k]) => k);

    if (missing.length) {
      if (req.file) deleteResumeFile(req.file.filename);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    // One qualification per user
    const existing = await QualificationModel.findByUserId(user_id);
    if (existing) {
      if (req.file) deleteResumeFile(req.file.filename);
      return res.status(409).json({
        success: false,
        message: `A qualification record for user ID ${user_id} already exists. Use PUT to update it.`,
      });
    }

    const url = resumeUrl(req, req.file?.filename);
    const record = await QualificationModel.create({
      user_id,
      department,
      designation: designation.trim(),
      degree,
      specialization: specialization.trim(),
      institute: institute.trim(),
      graduation_year,
      score_type,
      score: score.trim(),
      course_type,
      skills,
      certifications,
      experience_years,
      status,
      remarks,
      resume_file_name: req.file?.originalname || null,
      resume_file_size: req.file?.size || null,
      resume_file_type: req.file?.mimetype || null,
      resume_url: url,
    });

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    if (req.file) deleteResumeFile(req.file.filename);
    next(err);
  }
};

/**
 * PUT /api/qualifications/:id
 * Content-Type: multipart/form-data (all fields optional)
 * Admin can update any record; Employee can only update their own.
 */
const updateQualification = async (req, res, next) => {
  try {
    const existing = await QualificationModel.findById(req.params.id);
    if (!existing) {
      if (req.file) deleteResumeFile(req.file.filename);
      return res
        .status(404)
        .json({ success: false, message: "Qualification record not found." });
    }

    // Employee may only update their own record (by user_id FK)
    if (req.user.role === "Employee" && req.user.id !== existing.user_id) {
      if (req.file) deleteResumeFile(req.file.filename);
      return res
        .status(403)
        .json({
          success: false,
          message: "Access denied. You can only update your own record.",
        });
    }

    // New resume → delete old one
    let resumeFields = {};
    if (req.file) {
      deleteResumeFile(existing.resume_url);
      resumeFields = {
        resume_file_name: req.file.originalname,
        resume_file_size: req.file.size,
        resume_file_type: req.file.mimetype,
        resume_url: resumeUrl(req, req.file.filename),
      };
    }

    const updated = await QualificationModel.update(req.params.id, {
      ...req.body,
      ...resumeFields,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    if (req.file) deleteResumeFile(req.file.filename);
    next(err);
  }
};

/**
 * DELETE /api/qualifications/:id
 * Removes qualification record + resume file from disk.
 * Accessible by: Admin only
 */
const deleteQualification = async (req, res, next) => {
  try {
    const existing = await QualificationModel.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Qualification record not found." });
    }
    deleteResumeFile(existing.resume_url);
    await QualificationModel.delete(req.params.id);
    res.json({
      success: true,
      message: "Qualification record deleted successfully.",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/qualifications/:id/status
 * Body: { status }
 * Quick status change — Admin only
 */
const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "status is required." });
    }
    const existing = await QualificationModel.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Qualification record not found." });
    }
    const updated = await QualificationModel.update(req.params.id, { status });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllQualifications,
  getQualificationById,
  getMyQualification,
  createQualification,
  updateQualification,
  deleteQualification,
  updateStatus,
};
