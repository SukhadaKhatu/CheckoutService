import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Confirmation from "../src/components/Confirmation";
import { getOrder } from "../src/api";

vi.mock("../src/api", () => ({
  getOrder: vi.fn(),
}));

const order = {
  id: "order-42",
  subtotal_cents: 12500,
  discount_cents: 1500,
  shipping_cents: 0,
  tax_cents: 1000,
  total_cents: 12000,
};

function renderConfirmation(orderId = order.id) {
  return render(
    <MemoryRouter initialEntries={[`/confirmation/${orderId}`]}>
      <Routes>
        <Route path="/confirmation/:orderId" element={<Confirmation />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrder.mockResolvedValue(order);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a loading state while fetching the order", async () => {
    let resolveOrder;
    getOrder.mockReturnValue(new Promise((resolve) => {
      resolveOrder = resolve;
    }));
    renderConfirmation();

    expect(screen.getByText("Loading order...")).toBeTruthy();
    expect(getOrder).toHaveBeenCalledWith("order-42");

    resolveOrder(order);
    expect(await screen.findByRole("heading", { name: "Order confirmed!" })).toBeTruthy();
  });

  it("displays order details and the discount when present", async () => {
    renderConfirmation();

    expect(await screen.findByRole("heading", { name: "Order confirmed!" })).toBeTruthy();
    expect(screen.getByText("Order ID:").parentElement.textContent).toContain("order-42");
    expect(screen.getByText("Subtotal:").parentElement.textContent).toContain("$125.00");
    expect(screen.getByText("Discount:").parentElement.textContent).toContain("-$15.00");
    expect(screen.getByText("Shipping:").parentElement.textContent).toContain("FREE");
    expect(screen.getByText("Tax:").parentElement.textContent).toContain("$10.00");
    expect(screen.getByText("Total:").parentElement.textContent).toContain("$120.00");
    expect(screen.getByRole("link", { name: "Continue shopping" }).getAttribute("href")).toBe("/");
  });

  it("omits the discount line when no discount was applied", async () => {
    getOrder.mockResolvedValue({ ...order, discount_cents: 0 });
    renderConfirmation();

    expect(await screen.findByRole("heading", { name: "Order confirmed!" })).toBeTruthy();
    expect(screen.queryByText("Discount:")).toBeNull();
    expect(screen.getByText("Shipping:").parentElement.textContent).toContain("FREE");
  });

  it("formats a nonzero shipping charge", async () => {
    getOrder.mockResolvedValue({ ...order, shipping_cents: 899 });
    renderConfirmation();

    expect(await screen.findByRole("heading", { name: "Order confirmed!" })).toBeTruthy();
    expect(screen.getByText("Shipping:").parentElement.textContent).toContain("$8.99");
  });

  it("shows an error state with a continue-shopping link when loading fails", async () => {
    getOrder.mockRejectedValue(new Error("Order not found"));
    renderConfirmation();

    expect(await screen.findByRole("heading", { name: "Order not found" })).toBeTruthy();
    expect(screen.getByText("Order not found", { selector: "p" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue shopping" }).getAttribute("href")).toBe("/");
  });
});
