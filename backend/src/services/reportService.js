import { pool } from "../config/db.js";

export async function getReport() {
  const client = await pool.connect();

  try {
    /*
     * Successful order statistics
     */
    const orderStatsResult = await client.query(
      `
      SELECT
        COUNT(*)::integer AS successful_order_count,
        COALESCE(
          SUM(subtotal_cents),
          0
        )::bigint AS gross_revenue_cents,
        COALESCE(
          SUM(discount_cents),
          0
        )::bigint AS total_discounts_cents,
        COALESCE(
          SUM(total_cents),
          0
        )::bigint AS net_revenue_cents
      FROM orders
      `
    );

    const orderStats =
      orderStatsResult.rows[0];

    /*
     * Purchased quantity by product.
     *
     * IMPORTANT:
     * We use order_items rather than products because
     * order_items are immutable snapshots of successful
     * purchases.
     */
    const productStatsResult =
      await client.query(
        `
        SELECT
          product_id,
          product_name,
          SUM(quantity)::bigint
            AS quantity_purchased,
          SUM(line_total_cents)::bigint
            AS gross_sales_cents

        FROM order_items

        GROUP BY
          product_id,
          product_name

        ORDER BY quantity_purchased DESC,
                 product_name
        `
      );

    /*
     * Coupon statistics
     */
    const couponStatsResult =
      await client.query(
        `
        SELECT
          COUNT(*)::integer
            AS coupons_generated,

          COUNT(*) FILTER (
            WHERE status = 'AVAILABLE'
          )::integer
            AS coupons_available,

          COUNT(*) FILTER (
            WHERE status = 'REDEEMED'
          )::integer
            AS coupons_redeemed

        FROM coupons
        `
      );

    const couponStats =
      couponStatsResult.rows[0];

    return {
      successfulOrderCount:
        Number(
          orderStats.successful_order_count
        ),

      grossRevenueCents:
        Number(
          orderStats.gross_revenue_cents
        ),

      totalDiscountsCents:
        Number(
          orderStats.total_discounts_cents
        ),

      netRevenueCents:
        Number(
          orderStats.net_revenue_cents
        ),

      products:
        productStatsResult.rows.map(
          (product) => ({
            productId:
              product.product_id,

            productName:
              product.product_name,

            quantityPurchased:
              Number(
                product.quantity_purchased
              ),

            grossSalesCents:
              Number(
                product.gross_sales_cents
              ),
          })
        ),

      coupons: {
        generated:
          Number(
            couponStats.coupons_generated
          ),

        available:
          Number(
            couponStats.coupons_available
          ),

        redeemed:
          Number(
            couponStats.coupons_redeemed
          ),
      },
    };
  } finally {
    client.release();
  }
}