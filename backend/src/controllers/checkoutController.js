import * as checkoutService from "../services/checkoutService.js";

export async function checkout(
  req,
  res,
  next
) {
  try {
    const idempotencyKey =
      req.get("Idempotency-Key");

    const { couponCode } =
      req.body;

    const order =
      await checkoutService.checkoutCart(
        req.params.cartId,
        idempotencyKey,
        couponCode
      );

    res.status(201).json({
      order,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(
  req,
  res,
  next
) {
  try {
    const order =
      await checkoutService.findOrderById(
        req.params.orderId
      );

    if (!order) {
      const error =
        new Error("Order not found");

      error.code = "ORDER_NOT_FOUND";

      throw error;
    }

    res.json({
      order,
    });
  } catch (error) {
    next(error);
  }
}