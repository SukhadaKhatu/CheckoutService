import express from "express";

import {
  createCart,
  getCart,
  addItem,
  updateItem,
  removeItem,
} from "../controllers/cartController.js";

const router = express.Router();

router.post("/", createCart);

router.get("/:cartId", getCart);

router.post(
  "/:cartId/items",
  addItem
);

router.patch(
  "/:cartId/items/:productId",
  updateItem
);

router.delete(
  "/:cartId/items/:productId",
  removeItem
);

export default router;