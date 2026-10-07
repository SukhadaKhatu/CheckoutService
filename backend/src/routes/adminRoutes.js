import express from "express";

import {
  generateCoupon,
} from "../controllers/adminController.js";

const router = express.Router();

router.post(
  "/coupons/generate",
  generateCoupon
);

export default router;