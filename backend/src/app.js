import express from "express";
import cors from "cors";

import productRoutes from "./routes/productRoutes.js";

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

export default app;