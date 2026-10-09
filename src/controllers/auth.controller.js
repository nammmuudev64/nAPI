const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UserModel = require("../models/user.model");
const { sendResetPasswordEmail } = require("../services/email.service");

const ROLES = ["Admin", "Employee", "OtherUser"];

// Helper — sign a JWT for a user record
const signToken = (user) =>
  jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );

/**
 * POST /api/auth/register
 * Body: { name, email, password, role?, age? }
 * role defaults to "OtherUser". Only an existing Admin can assign Admin role.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = "OtherUser", age } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "name, email and password are required.",
      });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `role must be one of: ${ROLES.join(", ")}`,
      });
    }

    // If role is Admin, allow only when no Admin exists yet (first-time bootstrap)
    // OR when an existing Admin makes the request with a valid token
    if (role === "Admin") {
      const existingAdmin = await UserModel.findFirstAdmin();

      if (existingAdmin) {
        // At least one Admin already exists — require a valid Admin token
        const authHeader = req.headers["authorization"];
        const token = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;
        if (!token) {
          return res.status(403).json({
            success: false,
            message: "Only an Admin can register another Admin.",
          });
        }
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded.role !== "Admin") throw new Error();
        } catch {
          return res.status(403).json({
            success: false,
            message: "Only an Admin can register another Admin.",
          });
        }
      }
      // No Admin in DB yet — allow freely (first Admin bootstrap)
    }

    // Duplicate email
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email already in use." });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await UserModel.create({
      name,
      email,
      password: hashed,
      role,
      age,
    });

    const token = signToken(user);
    res.status(201).json({ success: true, token, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "email and password are required." });
    }

    // Fetch with password hash
    const user = await UserModel.findByEmailWithPassword(email);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    // Strip password before returning
    const { password: _pw, ...safeUser } = user;

    const token = signToken(safeUser);
    res.json({ success: true, token, data: safeUser });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 * Protected — requires a valid JWT.
 */
const getMe = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Protected — any authenticated user can change their own password.
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "currentPassword and newPassword are required.",
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "newPassword must be at least 6 characters.",
      });
    }

    const user = await UserModel.findByEmailWithPassword(req.user.email);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect." });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await UserModel.updatePassword(user.id, hashed);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Sends a password-reset link to the user's email. Always returns 200
 * (don't reveal whether the email exists).
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "email is required." });
    }

    const user = await UserModel.findByEmail(email);

    // Always respond with 200 to avoid email enumeration
    if (!user) {
      return res.json({
        success: true,
        message:
          "If that email is registered you will receive a reset link shortly.",
      });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    await UserModel.saveResetToken(user.id, hashedToken, expiry);

    const resetLink = `${process.env.APP_BASE_URL}/api/auth/reset-password/${rawToken}`;

    await sendResetPasswordEmail(user.email, user.name, resetLink);

    res.json({
      success: true,
      message:
        "If that email is registered you will receive a reset link shortly.",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/reset-password/:token
 * Body: { newPassword }
 * Validates the token, resets the password, invalidates the token.
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "newPassword is required." });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({
          success: false,
          message: "newPassword must be at least 6 characters.",
        });
    }

    // Hash the raw token from the URL to compare against the stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await UserModel.findByResetToken(hashedToken);

    if (!user) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Reset link is invalid or has expired.",
        });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await UserModel.updatePassword(user.id, hashedPassword);
    await UserModel.clearResetToken(user.id);

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now log in.",
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
};
