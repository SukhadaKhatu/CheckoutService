import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import Cart from "../src/components/Cart";
import { getCart, removeItem, updateItemQuantity } from "../src/api";

vi.mock("../src/api", () => ({
  getCart: vi.fn(),
  updateItemQuantity: vi.fn(),
  removeItem: vi.fn(),
}));

const cart = {
  items: [{
    productId: "product-1",
    productName: "Coffee",
    unitPrice: 12.5,
    quantity: 1,
    availableQuantity: 8,
  }],
  itemCount: 1,
  subtotal: 12.5,
  shipping: 8.99,
  tax: 1,
  total: 22.49,
};

function emptyCart() {
  return {
    items: [],
    itemCount: 0,
    subtotal: 0,
    shipping: 8.99,
    tax: 0,
    total: 8.99,
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderCart() {
  return render(
    <MemoryRouter initialEntries={["/cart"]}>
      <Cart />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("Cart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCart.mockResolvedValue(cart);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a loading state while loading, then renders cart items and totals", async () => {
    renderCart();

    expect(screen.getByText("Loading your cart...")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Your Shopping Cart" })).toBeTruthy();
    expect(getCart).toHaveBeenCalledOnce();
    expect(screen.getByText("1 item")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Coffee" })).toBeTruthy();
    expect(screen.getAllByText("$12.50")).toHaveLength(3);
    expect(screen.getByText("$22.49")).toBeTruthy();
    expect(screen.getByText("Add $87.50 more for free shipping.")).toBeTruthy();
  });

  it("shows an empty-cart message and a continue-shopping link", async () => {
    getCart.mockResolvedValue(emptyCart());
    renderCart();

    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue shopping" }).getAttribute("href")).toBe("/");
  });

  it("increments an item quantity and displays the updated cart", async () => {
    const updatedCart = {
      ...cart,
      items: [{ ...cart.items[0], quantity: 2 }],
      itemCount: 2,
      subtotal: 25,
      shipping: 0,
      tax: 2,
      total: 27,
    };
    updateItemQuantity.mockResolvedValue(updatedCart);
    renderCart();

    const item = await screen.findByRole("heading", { name: "Coffee" });
    const product = item.closest(".cart-product");
    fireEvent.click(within(product).getByRole("button", { name: "+" }));

    await waitFor(() => expect(updateItemQuantity).toHaveBeenCalledWith("product-1", 2));
    expect(await screen.findByText("2 items")).toBeTruthy();
    expect(screen.getByText("Your order qualifies for free shipping.")).toBeTruthy();
  });

  it("removes an item and switches to the empty-cart view", async () => {
    removeItem.mockResolvedValue(emptyCart());
    renderCart();

    const item = await screen.findByRole("heading", { name: "Coffee" });
    fireEvent.click(within(item.closest(".cart-product")).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeItem).toHaveBeenCalledWith("product-1"));
    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeTruthy();
  });

  it("displays an error if updating the quantity fails", async () => {
    updateItemQuantity.mockRejectedValue(new Error("Could not update cart"));
    renderCart();

    const item = await screen.findByRole("heading", { name: "Coffee" });
    fireEvent.click(within(item.closest(".cart-product")).getByRole("button", { name: "+" }));

    expect(await screen.findByText("Could not update cart")).toBeTruthy();
  });

  it("navigates to checkout when the checkout button is clicked", async () => {
    renderCart();
    await screen.findByRole("heading", { name: "Your Shopping Cart" });

    fireEvent.click(screen.getByRole("button", { name: "Proceed to checkout" }));

    expect(screen.getByLabelText("Current path").textContent).toBe("/checkout");
  });
});
