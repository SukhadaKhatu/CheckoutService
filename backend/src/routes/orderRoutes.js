import express from "express";

import {
  getOrder,
} from "../controllers/checkoutController.js";

const router = express.Router();

router.get("/:orderId", getOrder);

export default router;