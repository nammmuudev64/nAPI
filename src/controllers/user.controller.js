const path = require("path");
const fs = require("fs");
const UserModel = require("../models/user.model");

// Helper — build the public URL for an uploaded file
const imageUrl = (req, filename) =>
  filename ? `${req.protocol}://${req.get("host")}/uploads/${filename}` : null;

// Helper — delete the file from disk if it exists
const deleteImageFile = (imageUrlOrPath) => {
  if (!imageUrlOrPath) return;
  const filename = path.basename(imageUrlOrPath);
  const filepath = path.join(__dirname, "..", "..", "uploads", filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
};

/**
 * GET /api/users
 * Accessible by: Admin, Employee, OtherUser (all authenticated)
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await UserModel.findAll();
    res.json({ success: true, count: users.length, data: users });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/:id
 * Accessible by: all authenticated users
 * OtherUser can only view their own record.
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });

    // OtherUser cannot view other users' profiles
    if (req.user.role === "OtherUser" && req.user.id !== user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied." });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users
 * Accessible by: Admin only
 * Content-Type: multipart/form-data
 * Fields: name*, email*, password*, role?, age?, image?
 */
const createUser = async (req, res, next) => {
  try {
    const bcrypt = require("bcryptjs");
    const { name, email, password, role = "OtherUser", age } = req.body;

    if (!name || !email || !password) {
      if (req.file) deleteImageFile(req.file.filename);
      return res
        .status(400)
        .json({
          success: false,
          message: "name, email and password are required.",
        });
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      if (req.file) deleteImageFile(req.file.filename);
      return res
        .status(409)
        .json({ success: false, message: "Email already in use." });
    }

    const hashed = await bcrypt.hash(password, 12);
    const url = imageUrl(req, req.file?.filename);
    const user = await UserModel.create({
      name,
      email,
      password: hashed,
      role,
      age,
      image_url: url,
    });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    if (req.file) deleteImageFile(req.file.filename);
    next(err);
  }
};

/**
 * PUT /api/users/:id
 * Admin  — can update any user and change roles
 * Employee — can update their own record (no role change)
 * OtherUser — can update their own record (no role change)
 */
const updateUser = async (req, res, next) => {
  try {
    const existing = await UserModel.findById(req.params.id);
    if (!existing) {
      if (req.file) deleteImageFile(req.file.filename);
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Non-admins can only update themselves
    if (req.user.role !== "Admin" && req.user.id !== existing.id) {
      if (req.file) deleteImageFile(req.file.filename);
      return res
        .status(403)
        .json({ success: false, message: "Access denied." });
    }

    let { name, email, role, age } = req.body;

    // Only Admin may change roles
    if (role !== undefined && req.user.role !== "Admin") {
      if (req.file) deleteImageFile(req.file.filename);
      return res
        .status(403)
        .json({ success: false, message: "Only Admin can change roles." });
    }

    if (email && email !== existing.email) {
      const taken = await UserModel.findByEmail(email);
      if (taken) {
        if (req.file) deleteImageFile(req.file.filename);
        return res
          .status(409)
          .json({ success: false, message: "Email already in use." });
      }
    }

    let image_url = undefined;
    if (req.file) {
      deleteImageFile(existing.image_url);
      image_url = imageUrl(req, req.file.filename);
    }

    const updated = await UserModel.update(req.params.id, {
      name,
      email,
      role,
      age,
      image_url,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (req.file) deleteImageFile(req.file.filename);
    next(err);
  }
};

/**
 * DELETE /api/users/:id
 * Accessible by: Admin only
 */
const deleteUser = async (req, res, next) => {
  try {
    const existing = await UserModel.findById(req.params.id);
    if (!existing)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });

    deleteImageFile(existing.image_url);
    await UserModel.delete(req.params.id);
    res.json({ success: true, message: "User deleted successfully." });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
