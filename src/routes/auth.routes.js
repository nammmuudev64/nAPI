const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/auth.controller");
const { verifyToken } = require("../middlewares/auth");

/**
 * @route  POST  /api/auth/register              — register a new user
 * @route  POST  /api/auth/login                 — login, get JWT
 * @route  GET   /api/auth/me                    — get own profile  [protected]
 * @route  POST  /api/auth/change-password       — change own password [protected]
 * @route  POST  /api/auth/forgot-password       — send reset email
 * @route  POST  /api/auth/reset-password/:token — reset password with token
 */
router.post("/register", register);
router.post("/login", login);
router.get("/me", verifyToken, getMe);
router.post("/change-password", verifyToken, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

module.exports = router;
