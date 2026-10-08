import test from "node:test";
import assert from "node:assert/strict";

import checkoutRoutes from "../src/routes/checkoutRoutes.js";

test("checkout route registers the expected endpoint method and handler", () => {
  const routes = checkoutRoutes.stack
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
      path: "/:cartId/checkout",
      methods: ["post"],
      handlers: ["checkout"],
    },
  ]);
});
