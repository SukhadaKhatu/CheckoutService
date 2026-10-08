import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import CartItem from "../src/components/CartItem";

const item = {
  productId: "product-1",
  productName: "Coffee",
  unitPrice: 12.5,
  quantity: 2,
};

function renderCartItem(props = {}) {
  const handlers = {
    onIncrease: vi.fn(),
    onDecrease: vi.fn(),
    onRemove: vi.fn(),
    ...props,
  };

  render(<CartItem item={item} {...handlers} />);
  return handlers;
}

describe("CartItem", () => {
  afterEach(() => {
    cleanup();
  });

  it("displays the product name, unit price, quantity, and line total", () => {
    renderCartItem();

    expect(screen.getByRole("heading", { name: "Coffee" })).toBeTruthy();
    expect(screen.getByText("$12.50 each")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("$25.00")).toBeTruthy();
  });

  it("calls onIncrease with the product ID when the plus button is clicked", () => {
    const { onIncrease } = renderCartItem();

    fireEvent.click(screen.getByRole("button", { name: "+" }));

    expect(onIncrease).toHaveBeenCalledOnce();
    expect(onIncrease).toHaveBeenCalledWith("product-1");
  });

  it("calls onDecrease with the product ID when the minus button is clicked", () => {
    const { onDecrease } = renderCartItem();

    fireEvent.click(screen.getByRole("button", { name: "−" }));

    expect(onDecrease).toHaveBeenCalledOnce();
    expect(onDecrease).toHaveBeenCalledWith("product-1");
  });

  it("calls onRemove with the product ID when Remove is clicked", () => {
    const { onRemove } = renderCartItem();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith("product-1");
  });
});
