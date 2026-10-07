const API_BASE_URL = "http://localhost:3000/api";

const CART_ID_KEY = "checkout_rewards_cart_id";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "Something went wrong"
    );

    error.code = data?.error?.code || "UNKNOWN_ERROR";
    error.status = response.status;

    throw error;
  }

  return data;
}

function getStoredCartId() {
  return localStorage.getItem(CART_ID_KEY);
}

function storeCartId(cartId) {
  localStorage.setItem(CART_ID_KEY, cartId);
}

async function getOrCreateCart() {
  const existingCartId = getStoredCartId();

  if (existingCartId) {
    try {
      const data = await request(
        `/carts/${existingCartId}`
      );

      return data.cart;
    } catch (error) {
      if (error.code !== "CART_NOT_FOUND") {
        throw error;
      }

      localStorage.removeItem(CART_ID_KEY);
    }
  }

  const data = await request("/carts", {
    method: "POST",
  });

  storeCartId(data.cart.id);

  return data.cart;
}

export async function getProducts() {
  const data = await request("/products");

  return data.products.map((product) => ({
    id: product.id,
    name: product.name,

    // Backend stores money as cents.
    // Frontend continues working with dollars.
    price: product.price_cents / 100,

    availableQuantity: product.available_inventory,
  }));
}

export async function createCart() {
  const data = await request("/carts", {
    method: "POST",
  });

  storeCartId(data.cart.id);

  return {
    ...data.cart,
    items: [],
  };
}

export async function getCart() {
  const cart = await getOrCreateCart();

  return {
    ...cart,

    // Keep the frontend's existing item shape.
    items: cart.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPriceCents / 100,
      quantity: item.quantity,
      availableQuantity: item.availableInventory,
    })),

    itemCount: cart.itemCount,

    // Convert backend cents to dollars for display.
    subtotal: cart.subtotalCents / 100,
    shipping: cart.shippingCents / 100,
    tax: cart.taxCents / 100,
    total: cart.totalCents / 100,
  };
}

export async function addItem(productId, quantity = 1) {
  const cart = await getOrCreateCart();

  const data = await request(
    `/carts/${cart.id}/items`,
    {
      method: "POST",
      body: JSON.stringify({
        productId,
        quantity,
      }),
    }
  );

  return mapCart(data.cart);
}

export async function updateItemQuantity(
  productId,
  quantity
) {
  const cart = await getOrCreateCart();

  if (quantity <= 0) {
    return removeItem(productId);
  }

  const data = await request(
    `/carts/${cart.id}/items/${productId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        quantity,
      }),
    }
  );

  return mapCart(data.cart);
}

export async function removeItem(productId) {
  const cart = await getOrCreateCart();

  const data = await request(
    `/carts/${cart.id}/items/${productId}`,
    {
      method: "DELETE",
    }
  );

  return mapCart(data.cart);
}

function mapCart(cart) {
  return {
    ...cart,

    items: cart.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPriceCents / 100,
      quantity: item.quantity,
      availableQuantity: item.availableInventory,
    })),

    itemCount: cart.itemCount,
    subtotal: cart.subtotalCents / 100,
    shipping: cart.shippingCents / 100,
    tax: cart.taxCents / 100,
    total: cart.totalCents / 100,
  };
}

export async function checkout(couponCode = null) {
  const cart = await getOrCreateCart();

  const idempotencyKey = crypto.randomUUID();

  const data = await request(
    `/carts/${cart.id}/checkout`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        couponCode: couponCode || null,
      }),
    }
  );

  // The old cart is now permanently checked out.
  // Remove it so the next shopping session gets a new ACTIVE cart.
  clearCart();

  return data.order;
}

export function clearCart() {
  localStorage.removeItem(CART_ID_KEY);
}

export async function getOrder(orderId) {
  const data = await request(
    `/orders/${orderId}`
  );

  return data.order;
}