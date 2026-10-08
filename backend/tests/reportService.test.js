import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import { getReport } from "../src/services/reportService.js";

test("getReport maps database aggregates to numeric report values", async (t) => {
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  const queries = [];
  let released = false;

  pool.connect = async () => ({
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes("FROM orders")) {
        return {
          rows: [{
            successful_order_count: "3",
            gross_revenue_cents: "12500",
            total_discounts_cents: "500",
            net_revenue_cents: "11900",
          }],
        };
      }
      if (sql.includes("FROM order_items")) {
        return {
          rows: [{
            product_id: "product-1",
            product_name: "Test product",
            quantity_purchased: "4",
            gross_sales_cents: "12500",
          }],
        };
      }
      if (sql.includes("FROM coupons")) {
        return {
          rows: [{
            coupons_generated: "2",
            coupons_available: "1",
            coupons_redeemed: "1",
          }],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release: () => {
      released = true;
    },
  });

  t.after(() => {
    if (connectDescriptor) {
      Object.defineProperty(pool, "connect", connectDescriptor);
    } else {
      delete pool.connect;
    }
  });

  assert.deepStrictEqual(await getReport(), {
    successfulOrderCount: 3,
    grossRevenueCents: 12500,
    totalDiscountsCents: 500,
    netRevenueCents: 11900,
    products: [{
      productId: "product-1",
      productName: "Test product",
      quantityPurchased: 4,
      grossSalesCents: 12500,
    }],
    coupons: {
      generated: 2,
      available: 1,
      redeemed: 1,
    },
  });
  assert.equal(queries.length, 3);
  assert.equal(released, true);
});

test("getReport releases the database client if a query fails", async (t) => {
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  const failure = new Error("Database query failed");
  let released = false;

  pool.connect = async () => ({
    query: async () => {
      throw failure;
    },
    release: () => {
      released = true;
    },
  });

  t.after(() => {
    if (connectDescriptor) {
      Object.defineProperty(pool, "connect", connectDescriptor);
    } else {
      delete pool.connect;
    }
  });

  await assert.rejects(getReport(), (error) => error === failure);
  assert.equal(released, true);
});
