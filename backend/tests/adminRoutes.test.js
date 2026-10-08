import test from "node:test";
import assert from "node:assert/strict";

import adminRoutes from "../src/routes/adminRoutes.js";

test("admin routes register the expected endpoint methods and handlers", () => {
  const routes = adminRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
      handlers: layer.route.stack
        .map((routeLayer) => routeLayer.handle?.name)
        .filter(Boolean),
    }));

  assert.deepStrictEqual(routes, [
    {
      path: "/coupons/generate",
      methods: ["post"],
      handlers: ["generateCoupon"],
    },
    {
      path: "/reports",
      methods: ["get"],
      handlers: ["getReport"],
    },
  ]);
});
