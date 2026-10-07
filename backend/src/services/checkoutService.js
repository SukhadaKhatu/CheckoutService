import { pool } from "../config/db.js";

const TAX_PERCENT = 8;
const FREE_SHIPPING_THRESHOLD_CENTS = 10000;
const SHIPPING_CENTS = 899;

function calculateTax(subtotalCents) {
  return Math.round(
    (subtotalCents * TAX_PERCENT) / 100
  );
}

function calculateShipping(subtotalCents) {
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
    ? 0
    : SHIPPING_CENTS;
}

function calculateDiscount(subtotalCents, discountPercent) {
  if (!discountPercent) {
    return 0;
  }

  return Math.round(
    (subtotalCents * discountPercent) / 100
  );
}

export async function checkoutCart(
  cartId,
  idempotencyKey,
  couponCode = null
) {
  if (!idempotencyKey) {
    const error = new Error(
      "Idempotency-Key header is required"
    );

    error.code = "IDEMPOTENCY_KEY_REQUIRED";

    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * 1. Lock the cart.
     *
     * This serializes concurrent checkout attempts
     * for the same cart.
     */
    const cartResult = await client.query(
      `
      SELECT
        id,
        status
      FROM carts
      WHERE id = $1
      FOR UPDATE
      `,
      [cartId]
    );

    if (cartResult.rowCount === 0) {
      const error = new Error("Cart not found");
      error.code = "CART_NOT_FOUND";
      throw error;
    }

    const cart = cartResult.rows[0];

    /*
     * 2. Check whether this exact request has
     * already been processed.
     */
    const idempotencyResult = await client.query(
      `
      SELECT
        idempotency_key,
        order_id
      FROM checkout_idempotency_keys
      WHERE cart_id = $1
        AND idempotency_key = $2
      FOR UPDATE
      `,
      [cartId, idempotencyKey]
    );

    if (idempotencyResult.rowCount > 0) {
      const existingOrderId =
        idempotencyResult.rows[0].order_id;

      /*
       * The first checkout may have created the
       * idempotency record but not yet committed.
       *
       * Because we're inside the transaction and
       * locked the row, a committed record should
       * always have an order.
       */
      if (existingOrderId) {
        const existingOrder =
          await getOrderById(
            client,
            existingOrderId
          );

        await client.query("COMMIT");

        return existingOrder;
      }
    }

    /*
     * 3. A cart can only be checked out once.
     */
    if (cart.status === "CHECKED_OUT") {
      const error = new Error(
        "Cart has already been checked out"
      );

      error.code = "CART_ALREADY_CHECKED_OUT";

      throw error;
    }

    /*
     * 4. Get cart items.
     */
    const itemsResult = await client.query(
      `
      SELECT
        ci.product_id,
        ci.quantity,

        p.name,
        p.price_cents,
        p.available_inventory

      FROM cart_items ci

      INNER JOIN products p
        ON p.id = ci.product_id

      WHERE ci.cart_id = $1

      ORDER BY ci.product_id
      `,
      [cartId]
    );

    if (itemsResult.rowCount === 0) {
      const error = new Error(
        "Cannot checkout an empty cart"
      );

      error.code = "EMPTY_CART";

      throw error;
    }

    /*
     * 5. Lock products in deterministic order.
     *
     * Every checkout locks products in product_id
     * order. This significantly reduces deadlock risk
     * when multiple carts contain overlapping products.
     */
    const productIds = itemsResult.rows.map(
      (item) => item.product_id
    );

    const lockedProductsResult =
      await client.query(
        `
        SELECT
          id,
          name,
          price_cents,
          available_inventory

        FROM products

        WHERE id = ANY($1::uuid[])

        ORDER BY id

        FOR UPDATE
        `,
        [productIds]
      );

    const productsById = new Map();

    for (const product of lockedProductsResult.rows) {
      productsById.set(
        product.id,
        product
      );
    }

    /*
     * 6. Re-check inventory using the locked rows.
     */
    for (const item of itemsResult.rows) {
      const product =
        productsById.get(item.product_id);

      if (!product) {
        const error = new Error(
          `Product ${item.product_id} no longer exists`
        );

        error.code = "PRODUCT_NOT_FOUND";

        throw error;
      }

      if (
        item.quantity >
        product.available_inventory
      ) {
        const error = new Error(
          `Only ${product.available_inventory} units of ${product.name} are available`
        );

        error.code = "INSUFFICIENT_INVENTORY";

        throw error;
      }
    }

    /*
     * 7. Calculate subtotal using the CURRENT
     * product prices.
     *
     * The cart does not reserve prices.
     */
    let subtotalCents = 0;

    for (const item of itemsResult.rows) {
      const product =
        productsById.get(item.product_id);

      subtotalCents +=
        product.price_cents * item.quantity;
    }

    /*
     * 8. Coupon handling.
     */
    let coupon = null;
    let discountCents = 0;

    if (couponCode) {
      const couponResult =
        await client.query(
          `
          SELECT
            id,
            code,
            discount_percent,
            status

          FROM coupons

          WHERE code = $1

          FOR UPDATE
          `,
          [couponCode]
        );

      if (couponResult.rowCount === 0) {
        const error = new Error(
          "Coupon does not exist"
        );

        error.code = "COUPON_NOT_FOUND";

        throw error;
      }

      coupon = couponResult.rows[0];

      if (coupon.status !== "AVAILABLE") {
        const error = new Error(
          "Coupon has already been redeemed"
        );

        error.code = "COUPON_ALREADY_REDEEMED";

        throw error;
      }

      discountCents =
        calculateDiscount(
          subtotalCents,
          coupon.discount_percent
        );
    }

    /*
     * 9. Calculate final totals.
     */
    const taxCents =
      calculateTax(subtotalCents);

    const shippingCents =
      calculateShipping(subtotalCents);

    const totalCents = Math.max(
      0,
      subtotalCents +
        taxCents +
        shippingCents -
        discountCents
    );

    /*
     * 10. Deduct inventory.
     *
     * The product rows are already locked, so
     * another checkout cannot modify these products
     * until this transaction finishes.
     */
    for (const item of itemsResult.rows) {
      await client.query(
        `
        UPDATE products
        SET
          available_inventory =
            available_inventory - $1,
          updated_at = NOW()

        WHERE id = $2
        `,
        [
          item.quantity,
          item.product_id,
        ]
      );
    }

    /*
     * 11. Create order.
     */
    const orderResult = await client.query(
      `
      INSERT INTO orders (
        cart_id,
        subtotal_cents,
        discount_cents,
        tax_cents,
        shipping_cents,
        total_cents
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )

      RETURNING
        id,
        cart_id,
        subtotal_cents,
        discount_cents,
        tax_cents,
        shipping_cents,
        total_cents,
        created_at
      `,
      [
        cartId,
        subtotalCents,
        discountCents,
        taxCents,
        shippingCents,
        totalCents,
      ]
    );

    const order =
      orderResult.rows[0];

    /*
     * 12. Create immutable order item snapshots.
     */
    for (const item of itemsResult.rows) {
      const product =
        productsById.get(item.product_id);

      const lineTotalCents =
        product.price_cents *
        item.quantity;

      await client.query(
        `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name,
          unit_price_cents,
          quantity,
          line_total_cents
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        `,
        [
          order.id,
          product.id,
          product.name,
          product.price_cents,
          item.quantity,
          lineTotalCents,
        ]
      );
    }

    /*
     * 13. Redeem coupon.
     *
     * The coupon is locked, so two concurrent
     * checkouts cannot redeem it.
     */
    if (coupon) {
      await client.query(
        `
        UPDATE coupons

        SET
          status = 'REDEEMED',
          redeemed_order_id = $1,
          redeemed_at = NOW()

        WHERE id = $2
        `,
        [
          order.id,
          coupon.id,
        ]
      );
    }

    /*
     * 14. Mark cart as checked out.
     */
    await client.query(
      `
      UPDATE carts

      SET
        status = 'CHECKED_OUT',
        updated_at = NOW()

      WHERE id = $1
      `,
      [cartId]
    );

    /*
     * 15. Persist idempotency key.
     */
    await client.query(
      `
      INSERT INTO checkout_idempotency_keys (
        cart_id,
        idempotency_key,
        order_id
      )

      VALUES (
        $1,
        $2,
        $3
      )
      `,
      [
        cartId,
        idempotencyKey,
        order.id,
      ]
    );

    await client.query("COMMIT");

    /*
     * Return the complete order.
     */
    return getOrderById(
      pool,
      order.id
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getOrderById(
  db,
  orderId
) {
  const orderResult = await db.query(
    `
    SELECT
      id,
      cart_id,
      subtotal_cents,
      discount_cents,
      tax_cents,
      shipping_cents,
      total_cents,
      created_at

    FROM orders

    WHERE id = $1
    `,
    [orderId]
  );

  if (orderResult.rowCount === 0) {
    return null;
  }

  const order =
    orderResult.rows[0];

  const itemsResult = await db.query(
    `
    SELECT
      id,
      product_id,
      product_name,
      unit_price_cents,
      quantity,
      line_total_cents

    FROM order_items

    WHERE order_id = $1

    ORDER BY id
    `,
    [orderId]
  );

  return {
    ...order,
    items: itemsResult.rows,
  };
}