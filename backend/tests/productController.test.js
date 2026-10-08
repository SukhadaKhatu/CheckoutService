import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import { getProducts } from "../src/controllers/productController.js";

function stubPool(t, query) {
  const queryDescriptor = Object.getOwnPropertyDescriptor(pool, "query");
  pool.query = query;

  t.after(() => {
    if (queryDescriptor) {
      Object.defineProperty(pool, "query", queryDescriptor);
    } else {
      delete pool.query;
    }
  });
}

function makeResponse() {
  return {
    body: undefined,
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("getProducts returns products in the response", async (t) => {
  const products = [
    {
      id: "product-1",
      name: "Test product",
      price_cents: 2500,
      available_inventory: 10,
    },
  ];
  stubPool(t, async () => ({ rows: products }));
  const res = makeResponse();
  const nextCalls = [];

  await getProducts({}, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(res.body, { products });
  assert.deepStrictEqual(nextCalls, []);
});

test("getProducts forwards service errors to next", async (t) => {
  const failure = new Error("Database unavailable");
  stubPool(t, async () => {
    throw failure;
  });
  const res = makeResponse();
  const nextCalls = [];

  await getProducts({}, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(nextCalls, [failure]);
  assert.equal(res.body, undefined);
});
