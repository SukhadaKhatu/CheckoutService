import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import {
  generateCoupon,
  getReport,
} from "../src/controllers/adminController.js";

function stubClient(t, query) {
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  pool.connect = async () => ({
    query,
    release() {},
  });

  t.after(() => {
    if (connectDescriptor) {
      Object.defineProperty(pool, "connect", connectDescriptor);
    } else {
      delete pool.connect;
    }
  });
}

function response() {
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

const emptyResult = () => ({ rows: [], rowCount: 0 });

test("generateCoupon returns the service result with status 200", async (t) => {
  const coupon = {
    id: "coupon-1",
    code: "REWARD-5-ABC123",
    discount_percent: 10,
    milestone_order_number: 5,
    status: "AVAILABLE",
  };
  stubClient(t, async (sql) => {
    const statement = sql.trim();
    if (statement === "BEGIN" || statement === "COMMIT") {
      return emptyResult();
    }
    if (statement.includes("FROM reward_config")) {
      return {
        rows: [{ milestone_every_n_orders: 5, discount_percent: 10 }],
        rowCount: 1,
      };
    }
    if (statement.includes("COUNT(*)")) {
      return { rows: [{ successful_order_count: 5 }], rowCount: 1 };
    }
    if (statement.includes("generate_series")) {
      return { rows: [{ milestone: 5 }], rowCount: 1 };
    }
    if (statement.includes("INSERT INTO coupons")) {
      return { rows: [coupon], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${statement}`);
  });

  const res = response();
  const nextCalls = [];

  await generateCoupon({}, res, (error) => nextCalls.push(error));

  assert.equal(res.statusCode, 200);
  assert.deepStrictEqual(res.body, {
    generated: true,
    successfulOrderCount: 5,
    coupon,
  });
  assert.deepStrictEqual(nextCalls, []);
});

test("generateCoupon forwards service errors to next", async (t) => {
  const failure = new Error("Database unavailable");
  stubClient(t, async () => {
    throw failure;
  });
  const res = response();
  const nextCalls = [];

  await generateCoupon({}, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(nextCalls, [failure]);
  assert.equal(res.body, undefined);
});

test("getReport returns the report inside the response body", async (t) => {
  stubClient(t, async (sql) => {
    if (sql.includes("FROM orders")) {
      return {
        rows: [{
          successful_order_count: "2",
          gross_revenue_cents: "2000",
          total_discounts_cents: "100",
          net_revenue_cents: "1900",
        }],
      };
    }
    if (sql.includes("FROM order_items")) {
      return { rows: [] };
    }
    if (sql.includes("FROM coupons")) {
      return {
        rows: [{
          coupons_generated: "1",
          coupons_available: "1",
          coupons_redeemed: "0",
        }],
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const res = response();
  const nextCalls = [];

  await getReport({}, res, (error) => nextCalls.push(error));

  assert.equal(res.statusCode, undefined);
  assert.deepStrictEqual(res.body, {
    report: {
      successfulOrderCount: 2,
      grossRevenueCents: 2000,
      totalDiscountsCents: 100,
      netRevenueCents: 1900,
      products: [],
      coupons: {
        generated: 1,
        available: 1,
        redeemed: 0,
      },
    },
  });
  assert.deepStrictEqual(nextCalls, []);
});

test("getReport forwards service errors to next", async (t) => {
  const failure = new Error("Report query failed");
  stubClient(t, async () => {
    throw failure;
  });
  const res = response();
  const nextCalls = [];

  await getReport({}, res, (error) => nextCalls.push(error));

  assert.deepStrictEqual(nextCalls, [failure]);
  assert.equal(res.body, undefined);
});
