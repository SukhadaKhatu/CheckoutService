import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import {
  checkout,
  getOrder,
} from "../src/controllers/checkoutController.js";

function stubPool(t, { clientQuery, poolQuery }) {
  const queryDescriptor = Object.getOwnPropertyDescriptor(pool, "query");
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");

  pool.query = poolQuery;
  pool.connect = async () => ({
    query: clientQuery,
    release() {},
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
}

function makeResponse() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function emptyResult() {
  return { rows: [], rowCount: 0 };
}

test("checkout forwards request details and returns the created order with status 201", async (t) => {
  const order = {
    id: "order-1",
    cart_id: "cart-1",
    subtotal_cents: 5000,
    discount_cents: 500,
    tax_cents: 400,
    shipping_cents: 899,
    total_cents: 5799,
    items: [],
  };
  const clientCalls = [];
  const poolCalls = [];

  stubPool(t, {
    clientQuery: async (...args) => {
      clientCalls.push(args);
      const sql = args[0].trim();
      if (sql === "BEGIN" || sql === "COMMIT") {
        return emptyResult();
      }
      if (sql.includes("FROM carts")) {
        return { rows: [{ id: "cart-1", status: "ACTIVE" }], rowCount: 1 };
      }
      if (sql.includes("FROM checkout_idempotency_keys")) {
        return emptyResult();
      }
      if (sql.includes("FROM cart_items")) {
        return {
          rows: [{ product_id: "product-1", quantity: 1 }],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM products")) {
        return {
          rows: [{
            id: "product-1",
            name: "Test product",
            price_cents: 5000,
            available_inventory: 5,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM coupons")) {
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
      if (sql.includes("INSERT INTO orders")) {
        return { rows: [{ id: "order-1" }], rowCount: 1 };
      }
      return emptyResult();
    },
    poolQuery: async (...args) => {
      poolCalls.push(args);
      if (args[0].includes("FROM orders")) {
        const {
          subtotal_cents,
          discount_cents,
          tax_cents,
          shipping_cents,
          total_cents,
        } = order;
        return {
          rows: [{
            id: "order-1",
            cart_id: "cart-1",
            subtotal_cents,
            discount_cents,
            tax_cents,
            shipping_cents,
            total_cents,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  });

  const req = {
    params: { cartId: "cart-1" },
    body: { couponCode: "SAVE10" },
    get(name) {
      assert.equal(name, "Idempotency-Key");
      return "request-1";
    },
  };
  const res = makeResponse();
  const nextCalls = [];

  await checkout(req, res, (error) => nextCalls.push(error));

  assert.equal(res.statusCode, 201);
  assert.deepStrictEqual(res.body, { order });
  assert.deepStrictEqual(nextCalls, []);
  const couponCall = clientCalls.find(([sql]) => sql.includes("FROM coupons"));
  assert.deepStrictEqual(couponCall[1], ["SAVE10"]);
  const idempotencyCall = clientCalls.find(([sql]) =>
    sql.includes("INSERT INTO checkout_idempotency_keys")
  );
  assert.deepStrictEqual(idempotencyCall[1], ["cart-1", "request-1", "order-1"]);
  assert.deepStrictEqual(poolCalls.map(([, params]) => params), [
    ["order-1"],
    ["order-1"],
  ]);
});

test("checkout forwards service errors to next", async (t) => {
  stubPool(t, {
    clientQuery: async () => emptyResult(),
    poolQuery: async () => emptyResult(),
  });
  const res = makeResponse();
  const nextCalls = [];

  await checkout({
    params: { cartId: "cart-1" },
    body: {},
    get: () => undefined,
  }, res, (error) => nextCalls.push(error));

  assert.equal(nextCalls.length, 1);
  assert.equal(nextCalls[0].code, "IDEMPOTENCY_KEY_REQUIRED");
  assert.equal(res.body, undefined);
});

test("getOrder returns the requested order", async (t) => {
  const order = {
    id: "order-1",
    cart_id: "cart-1",
    total_cents: 5799,
  };
  const items = [{
    id: "item-1",
    product_id: "product-1",
    product_name: "Test product",
    quantity: 1,
    line_total_cents: 5000,
  }];

  stubPool(t, {
    clientQuery: async () => emptyResult(),
    poolQuery: async (sql) => sql.includes("FROM orders")
      ? { rows: [order], rowCount: 1 }
      : { rows: items, rowCount: 1 },
  });
  const res = makeResponse();
  const nextCalls = [];

  await getOrder({ params: { orderId: "order-1" } }, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(res.body, { order: { ...order, items } });
  assert.deepStrictEqual(nextCalls, []);
});

test("getOrder forwards ORDER_NOT_FOUND when the order does not exist", async (t) => {
  stubPool(t, {
    clientQuery: async () => emptyResult(),
    poolQuery: async () => ({ rows: [], rowCount: 0 }),
  });
  const res = makeResponse();
  const nextCalls = [];

  await getOrder({ params: { orderId: "missing-order" } }, res, (error) => nextCalls.push(error));

  assert.equal(nextCalls.length, 1);
  assert.equal(nextCalls[0].code, "ORDER_NOT_FOUND");
  assert.equal(nextCalls[0].message, "Order not found");
  assert.equal(res.body, undefined);
});

test("getOrder forwards database errors to next", async (t) => {
  const failure = new Error("Database unavailable");
  stubPool(t, {
    clientQuery: async () => emptyResult(),
    poolQuery: async () => {
      throw failure;
    },
  });
  const res = makeResponse();
  const nextCalls = [];

  await getOrder({ params: { orderId: "order-1" } }, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(nextCalls, [failure]);
  assert.equal(res.body, undefined);
});
