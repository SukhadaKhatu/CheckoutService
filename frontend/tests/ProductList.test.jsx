import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ProductList from "../src/components/ProductList";
import { addItem, getProducts } from "../src/api";

vi.mock("../src/api", () => ({
  addItem: vi.fn(),
  getProducts: vi.fn(),
}));

const products = [
  {
    id: "product-1",
    name: "Coffee",
    price: 12.5,
    availableQuantity: 8,
  },
  {
    id: "product-2",
    name: "Tea",
    price: 5,
    availableQuantity: 0,
  },
];

function renderProductList() {
  return render(
    <MemoryRouter>
      <ProductList />
    </MemoryRouter>,
  );
}

describe("ProductList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProducts.mockResolvedValue(products);
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and displays products with their prices and stock status", async () => {
    renderProductList();

    expect(await screen.findByRole("heading", { name: "Coffee" })).toBeTruthy();
    expect(getProducts).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Tea" })).toBeTruthy();

    const coffeeCard = screen.getByRole("heading", { name: "Coffee" }).closest(".product-card");
    const teaCard = screen.getByRole("heading", { name: "Tea" }).closest(".product-card");

    expect(within(coffeeCard).getByText("$12.50")).toBeTruthy();
    expect(within(coffeeCard).getByText("In stock")).toBeTruthy();
    expect(within(teaCard).getByText("$5.00")).toBeTruthy();
    expect(within(teaCard).getByText("Out of stock")).toBeTruthy();
  });

  it("disables Add to cart for out-of-stock products", async () => {
    renderProductList();

    await screen.findByRole("heading", { name: "Tea" });

    const teaCard = screen.getByRole("heading", { name: "Tea" }).closest(".product-card");
    expect(within(teaCard).getByRole("button", { name: "Add to cart" }).disabled).toBe(true);
  });

  it("adds an in-stock product and displays a success message", async () => {
    addItem.mockResolvedValue({});
    renderProductList();

    const coffee = await screen.findByRole("heading", { name: "Coffee" });
    const coffeeCard = coffee.closest(".product-card");
    fireEvent.click(within(coffeeCard).getByRole("button", { name: "Add to cart" }));

    await waitFor(() => expect(addItem).toHaveBeenCalledWith("product-1", 1));
    expect(await screen.findByText(/Added to cart/)).toBeTruthy();
  });

  it("displays the error when adding a product fails", async () => {
    addItem.mockRejectedValue(new Error("Unable to add product"));
    renderProductList();

    const coffee = await screen.findByRole("heading", { name: "Coffee" });
    const coffeeCard = coffee.closest(".product-card");
    fireEvent.click(within(coffeeCard).getByRole("button", { name: "Add to cart" }));

    expect(await screen.findByText(/Unable to add product/)).toBeTruthy();
  });

  it("links to the cart page", () => {
    renderProductList();

    expect(screen.getByRole("link", { name: "View cart →" }).getAttribute("href")).toBe("/cart");
  });
});
