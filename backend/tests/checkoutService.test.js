import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import {
  checkoutCart,
  findOrderById,
} from "../src/services/checkoutService.js";

function stubPool(t, { queryResult, clientQuery }) {
  const queryDescriptor = Object.getOwnPropertyDescriptor(pool, "query");
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  const poolCalls = [];
  const clientCalls = [];
  let released = false;

  pool.query = async (...args) => {
    poolCalls.push(args);
    return queryResult(...args);
  };
  pool.connect = async () => ({
    query: async (...args) => {
      clientCalls.push(args);
      return clientQuery(...args);
    },
    release: () => {
      released = true;
    },
  });

  t.after(() => {
    if (queryDescriptor) {
      Object.defineProperty(pool, "query", queryDescriptor);
    } else {
      delete pool.query;
    }
    if (connectDescriptor) {
      Object.defineProperty(pool, "connect", connectDescriptor);
    } else {
      delete pool.connect;
    }
  });

  return {
    poolCalls,
    clientCalls,
    wasReleased: () => released,
  };
}

function emptyResult() {
  return { rows: [], rowCount: 0 };
}

test("checkoutCart requires an idempotency key without connecting", async (t) => {
  const { wasReleased } = stubPool(t, {
    queryResult: async () => emptyResult(),
    clientQuery: async () => emptyResult(),
  });

  await assert.rejects(checkoutCart("cart-1"), {
    code: "IDEMPOTENCY_KEY_REQUIRED",
  });
  assert.equal(wasReleased(), false);
});

test("checkoutCart calculates coupon totals, redeems coupon, and persists the order", async (t) => {
  const returnedOrder = {
    id: "order-1",
    cart_id: "cart-1",
    subtotal_cents: 5000,
    discount_cents: 500,
    tax_cents: 400,
    shipping_cents: 899,
    total_cents: 5799,
    items: [],
  };
  const { clientCalls, poolCalls, wasReleased } = stubPool(t, {
    queryResult: async (sql) => {
      if (sql.includes("FROM orders")) {
        return {
          rows: [{
            id: "order-1",
            cart_id: "cart-1",
            subtotal_cents: 5000,
            discount_cents: 500,
            tax_cents: 400,
            shipping_cents: 899,
            total_cents: 5799,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM order_items")) {
        return { rows: [], rowCount: 0 };
      }
      return emptyResult();
    },
    clientQuery: async (sql) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "COMMIT") {
        return emptyResult();
      }
      if (statement.includes("FROM carts")) {
        return { rows: [{ id: "cart-1", status: "ACTIVE" }], rowCount: 1 };
      }
      if (statement.includes("FROM checkout_idempotency_keys")) {
        return emptyResult();
      }
      if (statement.includes("FROM cart_items")) {
        return {
          rows: [{ product_id: "product-1", quantity: 1 }],
          rowCount: 1,
        };
      }
      if (statement.includes("FROM products")) {
        return {
          rows: [{
            id: "product-1",
            name: "Test product",
            price_cents: 5000,
            available_inventory: 4,
          }],
          rowCount: 1,
        };
      }
      if (statement.includes("FROM coupons")) {
        return {
          rows: [{
            id: "coupon-1",
            code: "SAVE10",
            discount_percent: 10,
            status: "AVAILABLE",
          }],
          rowCount: 1,
        };
      }
      if (statement.includes("INSERT INTO orders")) {
        return {
          rows: [{ id: "order-1" }],
          rowCount: 1,
        };
      }
      return emptyResult();
    },
  });

  const order = await checkoutCart("cart-1", "request-1", "SAVE10");

  assert.deepStrictEqual(order, returnedOrder);
  const insertOrderCall = clientCalls.find(([sql]) =>
    sql.includes("INSERT INTO orders")
  );
  assert.deepStrictEqual(insertOrderCall[1], [
    "cart-1",
    5000,
    500,
    400,
    899,
    5799,
  ]);
  assert.equal(clientCalls.some(([sql]) => sql.includes("UPDATE coupons")), true);
  assert.equal(clientCalls.some(([sql]) => sql.includes("INSERT INTO checkout_idempotency_keys")), true);
  assert.deepStrictEqual(clientCalls.at(-1), ["COMMIT"]);
  assert.equal(poolCalls.length, 2);
  assert.deepStrictEqual(poolCalls[0][1], ["order-1"]);
  assert.equal(wasReleased(), true);
});

test("checkoutCart returns the existing order for a repeated idempotency key", async (t) => {
  const existingOrder = { id: "order-1", items: [] };
  const { clientCalls, wasReleased } = stubPool(t, {
    queryResult: async () => emptyResult(),
    clientQuery: async (sql) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "COMMIT") {
        return emptyResult();
      }
      if (statement.includes("FROM carts")) {
        return { rows: [{ id: "cart-1", status: "CHECKED_OUT" }], rowCount: 1 };
      }
      if (statement.includes("FROM checkout_idempotency_keys")) {
        return {
          rows: [{ idempotency_key: "request-1", order_id: "order-1" }],
          rowCount: 1,
        };
      }
      if (statement.includes("FROM orders")) {
        return { rows: [{ id: "order-1" }], rowCount: 1 };
      }
      if (statement.includes("FROM order_items")) {
        return { rows: [], rowCount: 0 };
      }
      return emptyResult();
    },
  });

  assert.deepStrictEqual(
    await checkoutCart("cart-1", "request-1"),
    existingOrder
  );
  assert.deepStrictEqual(clientCalls.at(-1), ["COMMIT"]);
  assert.equal(wasReleased(), true);
});

test("checkoutCart rolls back when the cart is empty", async (t) => {
  const { clientCalls, wasReleased } = stubPool(t, {
    queryResult: async () => emptyResult(),
    clientQuery: async (sql) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "ROLLBACK") {
        return emptyResult();
      }
      if (statement.includes("FROM carts")) {
        return { rows: [{ id: "cart-1", status: "ACTIVE" }], rowCount: 1 };
      }
      if (statement.includes("FROM checkout_idempotency_keys")) {
        return emptyResult();
      }
      if (statement.includes("FROM cart_items")) {
        return emptyResult();
      }
      return emptyResult();
    },
  });

  await assert.rejects(checkoutCart("cart-1", "request-1"), {
    code: "EMPTY_CART",
  });
  assert.deepStrictEqual(clientCalls.at(-1), ["ROLLBACK"]);
  assert.equal(wasReleased(), true);
});

test("findOrderById returns an order with its item snapshots", async (t) => {
  const order = {
    id: "order-1",
    cart_id: "cart-1",
    total_cents: 5799,
  };
  const items = [{
    id: "item-1",
    product_id: "product-1",
    product_name: "Test product",
    unit_price_cents: 5000,
    quantity: 1,
    line_total_cents: 5000,
  }];
  const { poolCalls } = stubPool(t, {
    queryResult: async (sql) => sql.includes("FROM orders")
      ? { rows: [order], rowCount: 1 }
      : { rows: items, rowCount: 1 },
    clientQuery: async () => emptyResult(),
  });

  assert.deepStrictEqual(await findOrderById("order-1"), {
    ...order,
    items,
  });
  assert.deepStrictEqual(poolCalls.map(([, params]) => params), [
    ["order-1"],
    ["order-1"],
  ]);
});
