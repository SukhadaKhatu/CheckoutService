import * as productService from "../services/productService.js";

export async function getProducts(req, res, next) {
  try {
    const products = await productService.getProducts();

    res.json({
      products,
    });
  } catch (error) {
    next(error);
  }
}