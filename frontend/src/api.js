const products = [
  {
    id: "p1",
    name: "Wireless Headphones",
    price: 99.99,
    availableQuantity: 10,
  },
  {
    id: "p2",
    name: "Mechanical Keyboard",
    price: 149.99,
    availableQuantity: 5,
  },
  {
    id: "p3",
    name: "USB-C Charger",
    price: 39.99,
    availableQuantity: 20,
  },
  {
    id: "p4",
    name: "Laptop Stand",
    price: 59.99,
    availableQuantity: 8,
  },
];

let cart = {
  id: crypto.randomUUID(),
  status: "ACTIVE",
  items: [],
};

export async function getProducts() {
  return [...products];
}

export async function createCart() {
  cart = {
    id: crypto.randomUUID(),
    status: "ACTIVE",
    items: [],
  };

  return { ...cart };
}

export async function getCart() {
  return {
    ...cart,
    items: cart.items.map((item) => ({ ...item })),
  };
}

export async function addItem(productId, quantity = 1) {
  const product = products.find((p) => p.id === productId);

  if (!product) {
    throw new Error("Product not found");
  }

  const existingItem = cart.items.find(
    (item) => item.productId === productId
  );

  const newQuantity = existingItem
    ? existingItem.quantity + quantity
    : quantity;

  if (newQuantity > product.availableQuantity) {
    throw new Error(
      `Only ${product.availableQuantity} units of ${product.name} are available`
    );
  }

  if (existingItem) {
    existingItem.quantity = newQuantity;
  } else {
    cart.items.push({
      productId: product.id,
      productName: product.name,

      // This is the price displayed when the item was added.
      unitPrice: product.price,

      quantity,
    });
  }

  return getCart();
}

export async function updateItemQuantity(productId, quantity) {
  const item = cart.items.find(
    (item) => item.productId === productId
  );

  if (!item) {
    throw new Error("Cart item not found");
  }

  const product = products.find((p) => p.id === productId);

  if (!product) {
    throw new Error("Product no longer exists");
  }

  if (quantity <= 0) {
    return removeItem(productId);
  }

  if (quantity > product.availableQuantity) {
    throw new Error(
      `Only ${product.availableQuantity} units are available`
    );
  }

  item.quantity = quantity;

  return getCart();
}

export async function removeItem(productId) {
  cart.items = cart.items.filter(
    (item) => item.productId !== productId
  );

  return getCart();
}