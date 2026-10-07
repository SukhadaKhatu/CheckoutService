import { pool } from "../config/db.js";

function mapCart(rows) {
  if (rows.length === 0) {
    return null;
  }

  const cart = {
    id: rows[0].cart_id,
    status: rows[0].cart_status,
    items: [],
  };

  for (const row of rows) {
    if (!row.product_id) {
      continue;
    }

    cart.items.push({
      productId: row.product_id,
      productName: row.product_name,
      unitPriceCents: row.price_cents,
      quantity: row.quantity,
      lineTotalCents: row.price_cents * row.quantity,
      availableInventory: row.available_inventory,
    });
  }

  const subtotalCents = cart.items.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0
  );

  cart.itemCount = cart.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  cart.subtotalCents = subtotalCents;

  // Free shipping for orders >= $100.
  cart.shippingCents =
    subtotalCents >= 10000 ? 0 : 899;

  // 8% tax.
  cart.taxCents = Math.round(
    (subtotalCents * 8) / 100
  );

  cart.totalCents =
    cart.subtotalCents +
    cart.shippingCents +
    cart.taxCents;

  return cart;
}


export async function createCart() {
  const result = await pool.query(`
    INSERT INTO carts (status)
    VALUES ('ACTIVE')
    RETURNING id, status, created_at
  `);

  return result.rows[0];
}


export async function getCart(cartId) {
  const result = await pool.query(
    `
    SELECT
      c.id AS cart_id,
      c.status AS cart_status,

      ci.product_id,
      ci.quantity,

      p.name AS product_name,
      p.price_cents,
      p.available_inventory

    FROM carts c

    LEFT JOIN cart_items ci
      ON ci.cart_id = c.id

    LEFT JOIN products p
      ON p.id = ci.product_id

    WHERE c.id = $1
    `,
    [cartId]
  );

  return mapCart(result.rows);
}


export async function addItem(
  cartId,
  productId,
  quantity
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    const error = new Error(
      "Quantity must be a positive integer"
    );

    error.code = "INVALID_QUANTITY";

    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the cart.
    const cartResult = await client.query(
      `
      SELECT id, status
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

    if (cart.status !== "ACTIVE") {
      const error = new Error(
        "Cart has already been checked out"
      );

      error.code = "CART_ALREADY_CHECKED_OUT";

      throw error;
    }

    // Lock the product.
    const productResult = await client.query(
      `
      SELECT
        id,
        name,
        available_inventory
      FROM products
      WHERE id = $1
      FOR UPDATE
      `,
      [productId]
    );

    if (productResult.rowCount === 0) {
      const error = new Error(
        "Product does not exist"
      );

      error.code = "PRODUCT_NOT_FOUND";

      throw error;
    }

    const product = productResult.rows[0];

    // Check whether the cart already contains
    // this product.
    const itemResult = await client.query(
      `
      SELECT quantity
      FROM cart_items
      WHERE cart_id = $1
        AND product_id = $2
      FOR UPDATE
      `,
      [cartId, productId]
    );

    const existingQuantity =
      itemResult.rowCount === 0
        ? 0
        : itemResult.rows[0].quantity;

    const newQuantity =
      existingQuantity + quantity;

    if (
      newQuantity >
      product.available_inventory
    ) {
      const error = new Error(
        `Only ${product.available_inventory} units of ${product.name} are available`
      );

      error.code = "INSUFFICIENT_INVENTORY";

      throw error;
    }

    await client.query(
      `
      INSERT INTO cart_items
        (cart_id, product_id, quantity)

      VALUES
        ($1, $2, $3)

      ON CONFLICT (cart_id, product_id)

      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        updated_at = NOW()
      `,
      [
        cartId,
        productId,
        newQuantity,
      ]
    );

    await client.query(
      `
      UPDATE carts
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [cartId]
    );

    await client.query("COMMIT");

    return getCart(cartId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function updateItemQuantity(
  cartId,
  productId,
  quantity
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    const error = new Error(
      "Quantity must be a positive integer"
    );

    error.code = "INVALID_QUANTITY";

    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cartResult = await client.query(
      `
      SELECT id, status
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

    if (cartResult.rows[0].status !== "ACTIVE") {
      const error = new Error(
        "Cart has already been checked out"
      );

      error.code = "CART_ALREADY_CHECKED_OUT";

      throw error;
    }

    const productResult = await client.query(
      `
      SELECT
        id,
        name,
        available_inventory
      FROM products
      WHERE id = $1
      FOR UPDATE
      `,
      [productId]
    );

    if (productResult.rowCount === 0) {
      const error = new Error(
        "Product does not exist"
      );

      error.code = "PRODUCT_NOT_FOUND";

      throw error;
    }

    const itemResult = await client.query(
      `
      SELECT quantity
      FROM cart_items
      WHERE cart_id = $1
        AND product_id = $2
      FOR UPDATE
      `,
      [cartId, productId]
    );

    if (itemResult.rowCount === 0) {
      const error = new Error(
        "Product is not in the cart"
      );

      error.code = "CART_ITEM_NOT_FOUND";

      throw error;
    }

    const product = productResult.rows[0];

    if (quantity > product.available_inventory) {
      const error = new Error(
        `Only ${product.available_inventory} units of ${product.name} are available`
      );

      error.code = "INSUFFICIENT_INVENTORY";

      throw error;
    }

    await client.query(
      `
      UPDATE cart_items
      SET
        quantity = $1,
        updated_at = NOW()
      WHERE cart_id = $2
        AND product_id = $3
      `,
      [
        quantity,
        cartId,
        productId,
      ]
    );

    await client.query(
      `
      UPDATE carts
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [cartId]
    );

    await client.query("COMMIT");

    return getCart(cartId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function removeItem(
  cartId,
  productId
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cartResult = await client.query(
      `
      SELECT id, status
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

    if (cartResult.rows[0].status !== "ACTIVE") {
      const error = new Error(
        "Cart has already been checked out"
      );

      error.code = "CART_ALREADY_CHECKED_OUT";

      throw error;
    }

    const result = await client.query(
      `
      DELETE FROM cart_items
      WHERE cart_id = $1
        AND product_id = $2
      RETURNING product_id
      `,
      [cartId, productId]
    );

    if (result.rowCount === 0) {
      const error = new Error(
        "Product is not in the cart"
      );

      error.code = "CART_ITEM_NOT_FOUND";

      throw error;
    }

    await client.query(
      `
      UPDATE carts
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [cartId]
    );

    await client.query("COMMIT");

    return getCart(cartId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}