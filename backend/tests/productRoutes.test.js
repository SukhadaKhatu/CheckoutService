import test from "node:test";
import assert from "node:assert/strict";

import productRoutes from "../src/routes/productRoutes.js";

test("product route registers the expected endpoint method and handler", () => {
  const routes = productRoutes.stack
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
      path: "/",
      methods: ["get"],
      handlers: ["getProducts"],
    },
  ]);
});
