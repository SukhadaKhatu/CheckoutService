import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../src/config/db.js";
import { generateCoupon } from "../src/services/couponService.js";

function stubPool(t, clientQuery) {
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  const calls = [];
  let released = false;

  pool.connect = async () => ({
    query: async (...args) => {
      calls.push(args);
      return clientQuery(...args);
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

  return {
    calls,
    wasReleased: () => released,
  };
}

const emptyResult = () => ({ rows: [], rowCount: 0 });

test("generateCoupon creates a coupon for the earliest unfulfilled milestone", async (t) => {
  const createdCoupon = {
    id: "coupon-1",
    discount_percent: 10,
    milestone_order_number: 5,
    status: "AVAILABLE",
    created_at: "2026-10-08T00:00:00.000Z",
  };
  const { calls, wasReleased } = stubPool(t, async (sql) => {
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
      return {
        rows: [{ successful_order_count: 10 }],
        rowCount: 1,
      };
    }
    if (statement.includes("generate_series")) {
      return { rows: [{ milestone: 5 }], rowCount: 1 };
    }
    if (statement.includes("INSERT INTO coupons")) {
      return {
        rows: [{ ...createdCoupon, code: calls.at(-1)[1][0] }],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected query: ${statement}`);
  });

  const result = await generateCoupon();

  assert.equal(result.generated, true);
  assert.equal(result.successfulOrderCount, 10);
  assert.match(result.coupon.code, /^REWARD-5-[A-F0-9]{12}$/);
  assert.equal(result.coupon.discount_percent, 10);
  assert.equal(result.coupon.milestone_order_number, 5);
  const insertCall = calls.find(([sql]) => sql.includes("INSERT INTO coupons"));
  assert.deepStrictEqual(insertCall[1].slice(1), [10, 5]);
  assert.deepStrictEqual(calls.at(-1), ["COMMIT"]);
  assert.equal(wasReleased(), true);
});

test("generateCoupon reports when no reward milestone has been reached", async (t) => {
  const { calls, wasReleased } = stubPool(t, async (sql) => {
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
      return {
        rows: [{ successful_order_count: 3 }],
        rowCount: 1,
      };
    }
    if (statement.includes("generate_series")) {
      return emptyResult();
    }
    throw new Error(`Unexpected query: ${statement}`);
  });

  assert.deepStrictEqual(await generateCoupon(), {
    generated: false,
    reason: "MILESTONE_NOT_REACHED",
    successfulOrderCount: 3,
  });
  assert.deepStrictEqual(calls.at(-1), ["COMMIT"]);
  assert.equal(wasReleased(), true);
});

test("generateCoupon reports when all reached milestones already have coupons", async (t) => {
  stubPool(t, async (sql) => {
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
      return {
        rows: [{ successful_order_count: 10 }],
        rowCount: 1,
      };
    }
    if (statement.includes("generate_series")) {
      return emptyResult();
    }
    throw new Error(`Unexpected query: ${statement}`);
  });

  assert.deepStrictEqual(await generateCoupon(), {
    generated: false,
    reason: "ALL_MILESTONES_ALREADY_GENERATED",
    successfulOrderCount: 10,
  });
});

test("generateCoupon rolls back when reward configuration is missing", async (t) => {
  const { calls, wasReleased } = stubPool(t, async (sql) => {
    const statement = sql.trim();
    if (statement === "BEGIN" || statement === "ROLLBACK") {
      return emptyResult();
    }
    if (statement.includes("FROM reward_config")) {
      return emptyResult();
    }
    throw new Error(`Unexpected query: ${statement}`);
  });

  await assert.rejects(generateCoupon(), {
    code: "REWARD_CONFIG_NOT_FOUND",
  });
  assert.deepStrictEqual(calls.at(-1), ["ROLLBACK"]);
  assert.equal(wasReleased(), true);
});
