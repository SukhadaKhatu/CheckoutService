import express from "express";

import {
  generateCoupon,
  getReport,
} from "../controllers/adminController.js";

const router = express.Router();

router.post(
  "/coupons/generate",
  generateCoupon
);

router.get(
  "/reports",
  getReport
);

export default router;