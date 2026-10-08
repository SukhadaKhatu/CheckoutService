import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import Checkout from "../src/components/Checkout";
import { checkout, getCart } from "../src/api";

vi.mock("../src/api", () => ({
  getCart: vi.fn(),
  checkout: vi.fn(),
}));

const cart = {
  items: [{
    productId: "product-1",
    productName: "Coffee",
    unitPrice: 12.5,
    quantity: 2,
    availableQuantity: 8,
  }],
  itemCount: 2,
  subtotal: 25,
  shipping: 0,
  tax: 2,
  total: 27,
};

function LocationDisplay() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={["/checkout"]}>
      <Checkout />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("Checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCart.mockResolvedValue(cart);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a loading state, then displays checkout details and order summary", async () => {
    renderCheckout();

    expect(screen.getByText("Loading checkout...")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Checkout" })).toBeTruthy();
    expect(getCart).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Delivery address" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Payment method" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Coupon" })).toBeTruthy();
    expect(screen.getByText("Coffee")).toBeTruthy();
    expect(screen.getByText("Qty: 2")).toBeTruthy();
    expect(screen.getByText("FREE")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Place order · $27.00" })).toBeTruthy();
  });

  it("submits a trimmed coupon code and navigates to order confirmation", async () => {
    checkout.mockResolvedValue({ id: "order-42" });
    renderCheckout();
    await screen.findByRole("heading", { name: "Checkout" });

    fireEvent.change(screen.getByPlaceholderText("Enter coupon code"), {
      target: { value: " SAVE10 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Place order · $27.00" }));

    await waitFor(() => expect(checkout).toHaveBeenCalledWith("SAVE10"));
    await waitFor(() => {
      expect(screen.getByLabelText("Current path").textContent).toBe("/confirmation/order-42");
    });
  });

  it("submits null when the coupon field contains only whitespace", async () => {
    checkout.mockResolvedValue({ id: "order-43" });
    renderCheckout();
    await screen.findByRole("heading", { name: "Checkout" });

    fireEvent.change(screen.getByPlaceholderText("Enter coupon code"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Place order · $27.00" }));

    await waitFor(() => expect(checkout).toHaveBeenCalledWith(null));
  });

  it("prevents placing an order for an empty cart", async () => {
    getCart.mockResolvedValue({ ...cart, items: [] });
    renderCheckout();
    await screen.findByRole("heading", { name: "Checkout" });

    fireEvent.click(screen.getByRole("button", { name: "Place order · $27.00" }));

    expect(await screen.findByText("Your cart is empty.")).toBeTruthy();
    expect(checkout).not.toHaveBeenCalled();
  });

  it("shows checkout errors and restores the place-order button", async () => {
    checkout.mockRejectedValue(new Error("Coupon is invalid"));
    renderCheckout();
    await screen.findByRole("heading", { name: "Checkout" });

    fireEvent.click(screen.getByRole("button", { name: "Place order · $27.00" }));

    expect(await screen.findByText("Coupon is invalid")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Place order · $27.00" }).disabled).toBe(false);
  });

  it("disables the submit button while checkout is in progress", async () => {
    let resolveCheckout;
    checkout.mockReturnValue(new Promise((resolve) => {
      resolveCheckout = resolve;
    }));
    renderCheckout();
    await screen.findByRole("heading", { name: "Checkout" });

    fireEvent.click(screen.getByRole("button", { name: "Place order · $27.00" }));

    const placingButton = screen.getByRole("button", { name: "Placing order..." });
    expect(placingButton.disabled).toBe(true);
    resolveCheckout({ id: "order-44" });
    await waitFor(() => {
      expect(screen.getByLabelText("Current path").textContent).toBe("/confirmation/order-44");
    });
  });
});
