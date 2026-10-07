export function errorHandler(
  error,
  req,
  res,
  next
) {
  console.error(error);

  const statusByCode = {
    INVALID_QUANTITY: 400,

    PRODUCT_NOT_FOUND: 404,

    CART_NOT_FOUND: 404,

    CART_ITEM_NOT_FOUND: 404,

    INSUFFICIENT_INVENTORY: 409,

    CART_ALREADY_CHECKED_OUT: 409,
  };

  const status =
    statusByCode[error.code] || 500;

  res.status(status).json({
    error: {
      code:
        error.code ||
        "INTERNAL_ERROR",

      message:
        error.message ||
        "An unexpected error occurred",
    },
  });
}   