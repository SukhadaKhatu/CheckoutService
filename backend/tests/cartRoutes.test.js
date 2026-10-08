import test from "node:test";
import assert from "node:assert/strict";

import cartRoutes from "../src/routes/cartRoutes.js";

function getRouteDefinitions(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
      handlers: layer.route.stack
        .map((routeLayer) => routeLayer.handle?.name)
        .filter(Boolean),
    }));
}

test("cart routes register the expected endpoint methods and handlers", () => {
  const routes = getRouteDefinitions(cartRoutes);

  assert.deepStrictEqual(routes, [
    {
      path: "/",
      methods: ["post"],
      handlers: ["createCart"],
    },
    {
      path: "/:cartId",
      methods: ["get"],
      handlers: ["getCart"],
    },
    {
      path: "/:cartId/items",
      methods: ["post"],
      handlers: ["addItem"],
    },
    {
      path: "/:cartId/items/:productId",
      methods: ["patch"],
      handlers: ["updateItem"],
    },
    {
      path: "/:cartId/items/:productId",
      methods: ["delete"],
      handlers: ["removeItem"],
    },
  ]);
});
