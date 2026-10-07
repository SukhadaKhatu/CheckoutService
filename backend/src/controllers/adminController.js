import * as couponService from "../services/couponService.js";

export async function generateCoupon(
  req,
  res,
  next
) {
  try {
    const result =
      await couponService.generateCoupon();

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}