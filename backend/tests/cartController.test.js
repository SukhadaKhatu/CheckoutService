import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import {
  addItem,
  createCart,
  getCart,
  removeItem,
  updateItem,
} from "../src/controllers/cartController.js";

function stubPool(t, {
  queryError,
  cartRows = [],
  existingQuantity = null,
} = {}) {
  const queryDescriptor = Object.getOwnPropertyDescriptor(pool, "query");
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  const poolCalls = [];
  const clientCalls = [];

  pool.query = async (...args) => {
    poolCalls.push(args);
    if (queryError) {
      throw queryError;
    }
    if (args[0].includes("INSERT INTO carts")) {
      return {
        rows: [{
          id: "cart-1",
          status: "ACTIVE",
          created_at: "2026-10-08T00:00:00.000Z",
        }],
      };
    }
    return { rows: cartRows };
  };

  pool.connect = async () => ({
    query: async (...args) => {
      clientCalls.push(args);
      const statement = args[0].trim();
      if (statement === "BEGIN" || statement === "COMMIT" || statement === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (statement.includes("FROM carts")) {
        return { rows: [{ id: "cart-1", status: "ACTIVE" }], rowCount: 1 };
      }
      if (statement.includes("FROM products")) {
        return {
          rows: [{
            id: "product-1",
            name: "Test product",
            available_inventory: 10,
          }],
          rowCount: 1,
        };
      }
      if (statement.startsWith("SELECT quantity")) {
        return existingQuantity === null
          ? { rows: [], rowCount: 0 }
          : { rows: [{ quantity: existingQuantity }], rowCount: 1 };
      }
      if (statement.startsWith("DELETE FROM cart_items")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
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

  return { poolCalls, clientCalls };
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

const cartRow = {
  cart_id: "cart-1",
  cart_status: "ACTIVE",
  product_id: "product-1",
  product_name: "Test product",
  price_cents: 2500,
  quantity: 2,
  available_inventory: 10,
};

const expectedCart = {
  id: "cart-1",
  status: "ACTIVE",
  items: [{
    productId: "product-1",
    productName: "Test product",
    unitPriceCents: 2500,
    quantity: 2,
    lineTotalCents: 5000,
    availableInventory: 10,
  }],
  itemCount: 2,
  subtotalCents: 5000,
  shippingCents: 899,
  taxCents: 400,
  totalCents: 6299,
};

test("createCart returns the created cart with status 201", async (t) => {
  stubPool(t);
  const res = makeResponse();
  const nextCalls = [];

  await createCart({}, res, (error) => nextCalls.push(error));

  assert.equal(res.statusCode, 201);
  assert.deepStrictEqual(res.body, {
    cart: {
      id: "cart-1",
      status: "ACTIVE",
      created_at: "2026-10-08T00:00:00.000Z",
    },
  });
  assert.deepStrictEqual(nextCalls, []);
});

test("createCart forwards service errors to next", async (t) => {
  const failure = new Error("Database unavailable");
  stubPool(t, { queryError: failure });
  const res = makeResponse();
  const nextCalls = [];

  await createCart({}, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(nextCalls, [failure]);
  assert.equal(res.body, undefined);
});

test("getCart returns the requested cart", async (t) => {
  const { poolCalls } = stubPool(t, { cartRows: [cartRow] });
  const res = makeResponse();
  const nextCalls = [];

  await getCart({ params: { cartId: "cart-1" } }, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(res.body, { cart: expectedCart });
  assert.deepStrictEqual(poolCalls[0][1], ["cart-1"]);
  assert.deepStrictEqual(nextCalls, []);
});

test("getCart returns 404 when the cart does not exist", async (t) => {
  stubPool(t);
  const res = makeResponse();

  await getCart({ params: { cartId: "missing-cart" } }, res, () => {});

  assert.equal(res.statusCode, 404);
  assert.deepStrictEqual(res.body, {
    error: {
      code: "CART_NOT_FOUND",
      message: "Cart not found",
    },
  });
});

test("addItem uses request fields and returns the updated cart", async (t) => {
  const { clientCalls, poolCalls } = stubPool(t, { cartRows: [cartRow] });
  const res = makeResponse();
  const nextCalls = [];

  await addItem({
    params: { cartId: "cart-1" },
    body: { productId: "product-1", quantity: 1 },
  }, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(res.body, { cart: expectedCart });
  const insertCall = clientCalls.find(([sql]) => sql.includes("INSERT INTO cart_items"));
  assert.deepStrictEqual(insertCall[1], ["cart-1", "product-1", 1]);
  assert.deepStrictEqual(poolCalls[0][1], ["cart-1"]);
  assert.deepStrictEqual(nextCalls, []);
});

test("addItem forwards invalid-quantity errors to next", async (t) => {
  stubPool(t);
  const res = makeResponse();
  const nextCalls = [];

  await addItem({
    params: { cartId: "cart-1" },
    body: { productId: "product-1", quantity: 0 },
  }, res, (error) => nextCalls.push(error));

  assert.equal(nextCalls.length, 1);
  assert.equal(nextCalls[0].code, "INVALID_QUANTITY");
  assert.equal(res.body, undefined);
});

test("updateItem returns the updated cart and forwards request parameters", async (t) => {
  const { clientCalls } = stubPool(t, {
    cartRows: [cartRow],
    existingQuantity: 2,
  });
  const res = makeResponse();
  const nextCalls = [];

  await updateItem({
    params: { cartId: "cart-1", productId: "product-1" },
    body: { quantity: 4 },
  }, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(res.body, { cart: expectedCart });
  const updateCall = clientCalls.find(([sql]) => sql.includes("UPDATE cart_items"));
  assert.deepStrictEqual(updateCall[1], [4, "cart-1", "product-1"]);
  assert.deepStrictEqual(nextCalls, []);
});

test("removeItem returns the updated cart", async (t) => {
  const { clientCalls } = stubPool(t, { cartRows: [cartRow] });
  const res = makeResponse();
  const nextCalls = [];

  await removeItem({
    params: { cartId: "cart-1", productId: "product-1" },
  }, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(res.body, { cart: expectedCart });
  assert.deepStrictEqual(clientCalls[2][1], ["cart-1", "product-1"]);
  assert.deepStrictEqual(nextCalls, []);
});
