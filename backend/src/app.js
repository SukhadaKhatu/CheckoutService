import express from "express";
import cors from "cors";

import productRoutes from "./routes/productRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";

import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
  })
);

app.use(express.json());


app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});


app.use(
  "/api/products",
  productRoutes
);

app.use(
  "/api/carts",
  cartRoutes
);


app.use(errorHandler);

export default app;