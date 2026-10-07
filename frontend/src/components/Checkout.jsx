import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getCart, checkout } from "../api";

function Checkout() {
  const [cart, setCart] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    async function loadCart() {
      try {
        const data = await getCart();
        setCart(data);
      } catch (error) {
        setError(error.message);
      }
    }

    loadCart();
  }, []);

  async function handlePlaceOrder() {
    setError("");

    if (cart.items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    try {
      setPlacingOrder(true);

      const order = await checkout(
        couponCode.trim() || null
      );

      navigate("/confirmation", {
        state: { order },
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  if (!cart) {
    return (
      <div className="page-loading">
        Loading checkout...
      </div>
    );
  }

  const subtotal = cart.subtotal;
  const shipping = cart.shipping;
  const tax = cart.tax;
  const total = cart.total;

  return (
    <main className="checkout-page">
      <div className="checkout-header">
        <Link to="/" className="logo">
          ShopEasy
        </Link>

        <div className="secure-label">
          🔒 Secure Checkout
        </div>
      </div>

      <div className="checkout-steps">
        <div className="step active">
          <span>1</span>
          Delivery
        </div>

        <div className="step-line" />

        <div className="step">
          <span>2</span>
          Payment
        </div>

        <div className="step-line" />

        <div className="step">
          <span>3</span>
          Confirmation
        </div>
      </div>

      <div className="checkout-layout">
        <section className="checkout-form">
          <h1>Checkout</h1>

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          <div className="checkout-section">
            <div className="section-heading">
              <div className="section-number">
                1
              </div>

              <div>
                <h2>Delivery address</h2>
                <p>
                  Where should we deliver your order?
                </p>
              </div>
            </div>

            <div className="form-grid">
              <label>
                First name
                <input placeholder="First name" />
              </label>

              <label>
                Last name
                <input placeholder="Last name" />
              </label>

              <label className="full">
                Address
                <input placeholder="Street address" />
              </label>

              <label>
                City
                <input placeholder="City" />
              </label>

              <label>
                State
                <input placeholder="State" />
              </label>

              <label>
                ZIP code
                <input placeholder="ZIP code" />
              </label>

              <label className="full">
                Phone number
                <input placeholder="Phone number" />
              </label>
            </div>
          </div>

          <div className="checkout-section">
            <div className="section-heading">
              <div className="section-number">
                2
              </div>

              <div>
                <h2>Payment method</h2>
                <p>
                  Your payment information is secure.
                </p>
              </div>
            </div>

            <div className="payment-option selected">
              <input
                type="radio"
                checked
                readOnly
              />

              <div>
                <strong>
                  Credit or debit card
                </strong>

                <p>
                  Visa, Mastercard, Amex
                </p>
              </div>
            </div>

            <div className="form-grid">
              <label className="full">
                Card number
                <input
                  placeholder="1234 5678 9012 3456"
                />
              </label>

              <label>
                Expiration
                <input placeholder="MM / YY" />
              </label>

              <label>
                CVV
                <input placeholder="CVV" />
              </label>
            </div>
          </div>

          <div className="checkout-section">
            <div className="section-heading">
              <div className="section-number">
                %
              </div>

              <div>
                <h2>Coupon</h2>
                <p>
                  Have a reward coupon?
                </p>
              </div>
            </div>

            <div className="coupon-row">
              <input
                value={couponCode}
                onChange={(event) =>
                  setCouponCode(event.target.value)
                }
                placeholder="Enter coupon code"
              />
            </div>
          </div>

          <button
            className="place-order-button"
            onClick={handlePlaceOrder}
            disabled={placingOrder}
          >
            {placingOrder
              ? "Placing order..."
              : `Place order · $${total.toFixed(2)}`}
          </button>

          <p className="terms">
            By placing your order, you agree to our
            terms and conditions.
          </p>
        </section>

        <aside className="checkout-summary">
          <h2>Order summary</h2>

          <div className="checkout-items">
            {cart.items.map((item) => (
              <div
                className="checkout-item"
                key={item.productId}
              >
                <div className="checkout-item-image">
                  {item.productName.charAt(0)}
                </div>

                <div className="checkout-item-info">
                  <strong>
                    {item.productName}
                  </strong>

                  <span>
                    Qty: {item.quantity}
                  </span>
                </div>

                <strong>
                  $
                  {(
                    item.unitPrice *
                    item.quantity
                  ).toFixed(2)}
                </strong>
              </div>
            ))}
          </div>

          <div className="summary-divider" />

          <div className="summary-line">
            <span>Subtotal</span>
            <span>
              ${subtotal.toFixed(2)}
            </span>
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
            <span>Tax</span>

            <span>
              ${tax.toFixed(2)}
            </span>
          </div>

          <div className="summary-divider" />

          <div className="summary-total">
            <span>Total</span>

            <strong>
              ${total.toFixed(2)}
            </strong>
          </div>

          <div className="secure-checkout">
            🔒 Your payment is protected
          </div>
        </aside>
      </div>
    </main>
  );
}

export default Checkout;