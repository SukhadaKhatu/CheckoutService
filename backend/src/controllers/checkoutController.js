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