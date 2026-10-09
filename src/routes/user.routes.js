const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const { verifyToken, authorizeRoles } = require("../middlewares/auth");
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/user.controller");

// All user routes require a valid JWT
router.use(verifyToken);

/**
 * GET  /api/users        — Admin, Employee, OtherUser
 * GET  /api/users/:id    — Admin, Employee (own only for OtherUser — enforced in controller)
 * POST /api/users        — Admin only
 * PUT  /api/users/:id    — Admin (any), Employee/OtherUser (own only — enforced in controller)
 * DELETE /api/users/:id  — Admin only
 */
router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.post("/", authorizeRoles("Admin"), upload.single("image"), createUser);
router.put(
  "/:id",
  authorizeRoles("Admin", "Employee", "OtherUser"),
  upload.single("image"),
  updateUser,
);
router.delete("/:id", authorizeRoles("Admin"), deleteUser);

module.exports = router;
