import * as cartService from "../services/cartService.js";


export async function createCart(req, res, next) {
  try {
    const cart = await cartService.createCart();

    res.status(201).json({
      cart,
    });
  } catch (error) {
    next(error);
  }
}


export async function getCart(req, res, next) {
  try {
    const cart = await cartService.getCart(
      req.params.cartId
    );

    if (!cart) {
      return res.status(404).json({
        error: {
          code: "CART_NOT_FOUND",
          message: "Cart not found",
        },
      });
    }

    res.json({
      cart,
    });
  } catch (error) {
    next(error);
  }
}


export async function addItem(req, res, next) {
  try {
    const {
      productId,
      quantity,
    } = req.body;

    const cart =
      await cartService.addItem(
        req.params.cartId,
        productId,
        quantity
      );

    res.json({
      cart,
    });
  } catch (error) {
    next(error);
  }
}


export async function updateItem(
  req,
  res,
  next
) {
  try {
    const { quantity } = req.body;

    const cart =
      await cartService.updateItemQuantity(
        req.params.cartId,
        req.params.productId,
        quantity
      );

    res.json({
      cart,
    });
  } catch (error) {
    next(error);
  }
}


export async function removeItem(
  req,
  res,
  next
) {
  try {
    const cart =
      await cartService.removeItem(
        req.params.cartId,
        req.params.productId
      );

    res.json({
      cart,
    });
  } catch (error) {
    next(error);
  }
}