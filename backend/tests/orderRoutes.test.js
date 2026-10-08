import test from "node:test";
import assert from "node:assert/strict";

import orderRoutes from "../src/routes/orderRoutes.js";

test("order route registers the expected endpoint method and handler", () => {
  const routes = orderRoutes.stack
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
      path: "/:orderId",
      methods: ["get"],
      handlers: ["getOrder"],
    },
  ]);
});
