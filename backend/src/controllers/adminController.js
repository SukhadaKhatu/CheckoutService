import * as couponService from "../services/couponService.js";
import * as reportService from "../services/reportService.js";

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

export async function getReport(
  req,
  res,
  next
) {
  try {
    const report =
      await reportService.getReport();

    res.json({
      report,
    });
  } catch (error) {
    next(error);
  }
}