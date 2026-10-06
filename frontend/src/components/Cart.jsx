import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getCart,
  updateItemQuantity,
  removeItem,
} from "../api";

function Cart() {
  const [cart, setCart] = useState(null);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    loadCart();
  }, []);

  async function loadCart() {
    try {
      const data = await getCart();
      setCart(data);
    } catch (error) {
      setError(error.message);
    }
  }

  async function updateQuantity(productId, quantity) {
    try {
      const updated = await updateItemQuantity(
        productId,
        quantity
      );

      setCart(updated);
    } catch (error) {
      setError(error.message);
    }
  }

  async function remove(productId) {
    try {
      const updated = await removeItem(productId);
      setCart(updated);
    } catch (error) {
      setError(error.message);
    }
  }

  if (!cart) {
    return (
      <div className="page-loading">
        Loading your cart...
      </div>
    );
  }

  const subtotal = cart.items.reduce(
    (sum, item) =>
      sum + item.unitPrice * item.quantity,
    0
  );

  const shipping = subtotal >= 100 ? 0 : 8.99;

  const tax = subtotal * 0.08;

  const total = subtotal + shipping + tax;

  const itemCount = cart.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  if (cart.items.length === 0) {
    return (
      <main className="empty-cart-page">

        <div className="empty-cart-icon">
          🛒
        </div>

        <h1>Your cart is empty</h1>

        <p>
          Looks like you haven't added anything
          to your cart yet.
        </p>

        <Link to="/" className="primary-button">
          Continue shopping
        </Link>

      </main>
    );
  }

  return (
    <main className="cart-page">

      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>›</span>
        <span>Shopping Cart</span>
      </div>

      <h1>Your Shopping Cart</h1>

      <p className="cart-count">
        {itemCount} {itemCount === 1 ? "item" : "items"}
      </p>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <div className="cart-layout">

        <section className="cart-items">

          {cart.items.map((item) => {

            const lineTotal =
              item.unitPrice * item.quantity;

            return (
              <div
                className="cart-product"
                key={item.productId}
              >

                <div className="cart-product-image">
                  {item.productName.charAt(0)}
                </div>

                <div className="cart-product-info">

                  <h3>{item.productName}</h3>

                  <p className="in-stock">
                    ✓ In stock
                  </p>

                  <p className="unit-price">
                    ${item.unitPrice.toFixed(2)}
                  </p>

                  <div className="cart-actions">

                    <div className="quantity">

                      <button
                        onClick={() =>
                          updateQuantity(
                            item.productId,
                            item.quantity - 1
                          )
                        }
                      >
                        −
                      </button>

                      <span>
                        {item.quantity}
                      </span>

                      <button
                        onClick={() =>
                          updateQuantity(
                            item.productId,
                            item.quantity + 1
                          )
                        }
                      >
                        +
                      </button>

                    </div>

                    <button
                      className="text-button"
                      onClick={() =>
                        remove(item.productId)
                      }
                    >
                      Remove
                    </button>

                    <button className="text-button">
                      Save for later
                    </button>

                  </div>

                </div>

                <div className="line-price">
                  ${lineTotal.toFixed(2)}
                </div>

              </div>
            );
          })}

          <div className="shipping-message">
            <strong>🚚 Free shipping</strong>

            <span>
              Your order qualifies for free shipping.
            </span>
          </div>

        </section>

        <aside className="order-summary">

          <h2>Order Summary</h2>

          <div className="summary-line">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          <div className="summary-line">
            <span>Shipping</span>

            <span>
              {shipping === 0
                ? "FREE"
                : `$${shipping.toFixed(2)}`}
            </span>
          </div>

          <div className="summary-line">
            <span>Estimated tax</span>
            <span>${tax.toFixed(2)}</span>
          </div>

          <div className="summary-divider" />

          <div className="summary-total">
            <span>Total</span>
            <strong>${total.toFixed(2)}</strong>
          </div>

          <button
            className="checkout-button"
            onClick={() => navigate("/checkout")}
          >
            Proceed to checkout
          </button>

          <Link
            to="/"
            className="continue-shopping"
          >
            ← Continue shopping
          </Link>

          <div className="secure-checkout">
            🔒 Secure checkout
          </div>

        </aside>

      </div>

    </main>
  );
}

export default Cart;