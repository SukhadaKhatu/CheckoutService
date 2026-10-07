import crypto from "crypto";
import { pool } from "../config/db.js";

export async function generateCoupon() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Lock reward configuration.
     *
     * This serializes concurrent coupon-generation
     * requests.
     */
    const configResult = await client.query(
      `
      SELECT
        milestone_every_n_orders,
        discount_percent
      FROM reward_config
      WHERE id = 1
      FOR UPDATE
      `
    );

    if (configResult.rowCount === 0) {
      const error = new Error(
        "Reward configuration not found"
      );

      error.code = "REWARD_CONFIG_NOT_FOUND";

      throw error;
    }

    const config = configResult.rows[0];

    /*
     * Count successful orders.
     */
    const orderCountResult = await client.query(
      `
      SELECT COUNT(*)::integer AS successful_order_count
      FROM orders
      `
    );

    const successfulOrderCount =
      orderCountResult.rows[0]
        .successful_order_count;

    /*
     * Determine the earliest milestone that has
     * been reached but does not yet have a coupon.
     *
     * Example:
     *
     * 10 successful orders
     * N = 5
     *
     * Milestones reached:
     * 5, 10
     *
     * If neither coupon exists:
     * first call -> milestone 5
     * second call -> milestone 10
     */
    const milestoneResult = await client.query(
      `
      SELECT milestone
      FROM generate_series(
        $1,
        $2,
        $1
      ) AS milestone
      WHERE milestone <= $3
        AND NOT EXISTS (
          SELECT 1
          FROM coupons c
          WHERE c.milestone_order_number = milestone
        )
      ORDER BY milestone
      LIMIT 1
      `,
      [
        config.milestone_every_n_orders,
        successfulOrderCount,
        successfulOrderCount,
      ]
    );

    if (milestoneResult.rowCount === 0) {
      await client.query("COMMIT");

      return {
        generated: false,
        reason:
          successfulOrderCount <
          config.milestone_every_n_orders
            ? "MILESTONE_NOT_REACHED"
            : "ALL_MILESTONES_ALREADY_GENERATED",
        successfulOrderCount,
      };
    }

    const milestoneOrderNumber =
      milestoneResult.rows[0].milestone;

    const couponCode =
      `REWARD-${milestoneOrderNumber}-${crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 12)
        .toUpperCase()}`;

    const couponResult = await client.query(
      `
      INSERT INTO coupons (
        code,
        discount_percent,
        milestone_order_number,
        status
      )

      VALUES (
        $1,
        $2,
        $3,
        'AVAILABLE'
      )

      RETURNING
        id,
        code,
        discount_percent,
        milestone_order_number,
        status,
        created_at
      `,
      [
        couponCode,
        config.discount_percent,
        milestoneOrderNumber,
      ]
    );

    await client.query("COMMIT");

    return {
      generated: true,
      successfulOrderCount,
      coupon: couponResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}