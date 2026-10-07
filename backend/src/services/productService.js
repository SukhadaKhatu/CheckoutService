import { pool } from "../config/db.js";

export async function getProducts() {
  const result = await pool.query(`
    SELECT
      id,
      name,
      price_cents,
      available_inventory
    FROM products
    ORDER BY created_at
  `);

  return result.rows;
}