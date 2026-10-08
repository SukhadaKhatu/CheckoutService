import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import {
  addItem,
  createCart,
  getCart,
  removeItem,
  updateItemQuantity,
} from "../src/services/cartService.js";

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

const cartRows = [
  {
    cart_id: "cart-1",
    cart_status: "ACTIVE",
    product_id: "product-1",
    product_name: "Test product",
    price_cents: 5000,
    quantity: 2,
    available_inventory: 8,
  },
];

function emptyQueryResult() {
  return { rows: [], rowCount: 0 };
}

test("createCart returns the inserted cart", async (t) => {
  const createdCart = {
    id: "cart-1",
    status: "ACTIVE",
    created_at: "2026-10-08T00:00:00.000Z",
  };
  const { poolCalls } = stubPool(t, {
    queryResult: async () => ({ rows: [createdCart] }),
    clientQuery: async () => emptyQueryResult(),
  });

  assert.deepStrictEqual(await createCart(), createdCart);
  assert.match(poolCalls[0][0], /INSERT INTO carts/);
});

test("getCart maps cart items and calculates totals", async (t) => {
  const { poolCalls } = stubPool(t, {
    queryResult: async () => ({ rows: cartRows }),
    clientQuery: async () => emptyQueryResult(),
  });

  assert.deepStrictEqual(await getCart("cart-1"), {
    id: "cart-1",
    status: "ACTIVE",
    items: [
      {
        productId: "product-1",
        productName: "Test product",
        unitPriceCents: 5000,
        quantity: 2,
        lineTotalCents: 10000,
        availableInventory: 8,
      },
    ],
    itemCount: 2,
    subtotalCents: 10000,
    shippingCents: 0,
    taxCents: 800,
    totalCents: 10800,
  });
  assert.deepStrictEqual(poolCalls[0][1], ["cart-1"]);
});

test("getCart returns null when the cart does not exist", async (t) => {
  stubPool(t, {
    queryResult: async () => ({ rows: [] }),
    clientQuery: async () => emptyQueryResult(),
  });

  assert.equal(await getCart("missing-cart"), null);
});

test("addItem rejects invalid quantities before connecting to the database", async (t) => {
  const { wasReleased } = stubPool(t, {
    queryResult: async () => ({ rows: [] }),
    clientQuery: async () => emptyQueryResult(),
  });

  await assert.rejects(addItem("cart-1", "product-1", 0), {
    code: "INVALID_QUANTITY",
  });
  assert.equal(wasReleased(), false);
});

test("addItem updates the cart in a transaction and returns the updated cart", async (t) => {
  const { clientCalls, poolCalls, wasReleased } = stubPool(t, {
    queryResult: async () => ({ rows: cartRows }),
    clientQuery: async (sql) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "COMMIT") {
        return emptyQueryResult();
      }
      if (statement.includes("FROM carts")) {
        return { rowCount: 1, rows: [{ id: "cart-1", status: "ACTIVE" }] };
      }
      if (statement.includes("FROM products")) {
        return {
          rowCount: 1,
          rows: [{ id: "product-1", name: "Test product", available_inventory: 8 }],
        };
      }
      if (statement.includes("FROM cart_items")) {
        return { rowCount: 1, rows: [{ quantity: 1 }] };
      }
      return emptyQueryResult();
    },
  });

  const result = await addItem("cart-1", "product-1", 2);

  assert.equal(result.subtotalCents, 10000);
  assert.deepStrictEqual(clientCalls[0], ["BEGIN"]);
  assert.deepStrictEqual(clientCalls.at(-1), ["COMMIT"]);
  assert.deepStrictEqual(clientCalls[4][1], ["cart-1", "product-1", 3]);
  assert.deepStrictEqual(poolCalls[0][1], ["cart-1"]);
  assert.equal(wasReleased(), true);
});

test("addItem rolls back when the requested quantity exceeds inventory", async (t) => {
  const { clientCalls, wasReleased } = stubPool(t, {
    queryResult: async () => ({ rows: [] }),
    clientQuery: async (sql) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "ROLLBACK") {
        return emptyQueryResult();
      }
      if (statement.includes("FROM carts")) {
        return { rowCount: 1, rows: [{ id: "cart-1", status: "ACTIVE" }] };
      }
      if (statement.includes("FROM products")) {
        return {
          rowCount: 1,
          rows: [{ id: "product-1", name: "Test product", available_inventory: 1 }],
        };
      }
      if (statement.includes("FROM cart_items")) {
        return { rowCount: 0, rows: [] };
      }
      return emptyQueryResult();
    },
  });

  await assert.rejects(addItem("cart-1", "product-1", 2), {
    code: "INSUFFICIENT_INVENTORY",
  });
  assert.deepStrictEqual(clientCalls.at(-1), ["ROLLBACK"]);
  assert.equal(wasReleased(), true);
});

test("updateItemQuantity updates the item and returns the updated cart", async (t) => {
  const { clientCalls, wasReleased } = stubPool(t, {
    queryResult: async () => ({ rows: cartRows }),
    clientQuery: async (sql) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "COMMIT") {
        return emptyQueryResult();
      }
      if (statement.includes("FROM carts")) {
        return { rowCount: 1, rows: [{ id: "cart-1", status: "ACTIVE" }] };
      }
      if (statement.includes("FROM products")) {
        return {
          rowCount: 1,
          rows: [{ id: "product-1", name: "Test product", available_inventory: 8 }],
        };
      }
      if (statement.includes("FROM cart_items")) {
        return { rowCount: 1, rows: [{ quantity: 2 }] };
      }
      return emptyQueryResult();
    },
  });

  const result = await updateItemQuantity("cart-1", "product-1", 4);

  assert.equal(result.id, "cart-1");
  assert.deepStrictEqual(clientCalls[4][1], [4, "cart-1", "product-1"]);
  assert.deepStrictEqual(clientCalls.at(-1), ["COMMIT"]);
  assert.equal(wasReleased(), true);
});

test("removeItem deletes the item and returns the updated cart", async (t) => {
  const { clientCalls, wasReleased } = stubPool(t, {
    queryResult: async () => ({ rows: [] }),
    clientQuery: async (sql) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "COMMIT") {
        return emptyQueryResult();
      }
      if (statement.includes("FROM carts")) {
        return { rowCount: 1, rows: [{ id: "cart-1", status: "ACTIVE" }] };
      }
      if (statement.startsWith("DELETE FROM cart_items")) {
        return { rowCount: 1, rows: [{ product_id: "product-1" }] };
      }
      return emptyQueryResult();
    },
  });

  await removeItem("cart-1", "product-1");

  assert.deepStrictEqual(clientCalls[2][1], ["cart-1", "product-1"]);
  assert.deepStrictEqual(clientCalls.at(-1), ["COMMIT"]);
  assert.equal(wasReleased(), true);
});
