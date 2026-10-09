const express = require("express");
const router = express.Router();
const uploadResume = require("../middlewares/uploadResume");
const { verifyToken, authorizeRoles } = require("../middlewares/auth");
const {
  getAllQualifications,
  getQualificationById,
  getMyQualification,
  createQualification,
  updateQualification,
  deleteQualification,
  updateStatus,
} = require("../controllers/qualification.controller");

// All qualification routes require a valid JWT
router.use(verifyToken);

/**
 * GET  /api/qualifications          — list all            (Admin, Employee)
 *      ?department=&status=&search=
 * GET  /api/qualifications/me       — own record          (any role)
 * GET  /api/qualifications/:id      — one record          (Admin | Employee: own)
 * POST /api/qualifications          — create              (Admin, Employee)
 * PUT  /api/qualifications/:id      — update              (Admin: any | Employee: own)
 * DELETE /api/qualifications/:id    — delete              (Admin only)
 * PATCH /api/qualifications/:id/status — change status    (Admin only)
 */

// /me must come BEFORE /:id so it isn't treated as an id
router.get("/me", getMyQualification);

router.get("/", authorizeRoles("Admin", "Employee"), getAllQualifications);

router.get("/:id", authorizeRoles("Admin", "Employee"), getQualificationById);

router.post(
  "/",
  authorizeRoles("Admin", "Employee"),
  uploadResume.single("resume"),
  createQualification,
);

router.put(
  "/:id",
  authorizeRoles("Admin", "Employee"),
  uploadResume.single("resume"),
  updateQualification,
);

router.delete("/:id", authorizeRoles("Admin"), deleteQualification);

router.patch("/:id/status", authorizeRoles("Admin"), updateStatus);

module.exports = router;
