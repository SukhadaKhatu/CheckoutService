import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import { getProducts } from "../src/services/productService.js";

test("getProducts returns products ordered by creation time", async (t) => {
  const queryDescriptor = Object.getOwnPropertyDescriptor(pool, "query");
  const products = [
    {
      id: "product-1",
      name: "Test product",
      price_cents: 2500,
      available_inventory: 7,
    },
  ];
  let query;

  pool.query = async (...args) => {
    query = args;
    return { rows: products };
  };

  t.after(() => {
    if (queryDescriptor) {
      Object.defineProperty(pool, "query", queryDescriptor);
    } else {
      delete pool.query;
    }
  });

  assert.deepStrictEqual(await getProducts(), products);
  assert.match(query[0], /FROM products\s+ORDER BY created_at/);
  assert.equal(query.length, 1);
});
