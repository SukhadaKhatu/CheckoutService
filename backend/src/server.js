import dotenv from "dotenv";
dotenv.config();

import { pool } from "./config/db.js";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log("Database connected successfully!");
    console.log("Database time:", result.rows[0].now);

    console.log(`Backend running on http://localhost:${PORT}`);
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error);
    process.exit(1);
  }
}

startServer();