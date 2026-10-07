import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getOrder } from "../api";

function Confirmation() {
  const { orderId } = useParams();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOrder() {
      try {
        const data = await getOrder(orderId);
        setOrder(data);
      } catch (error) {
        setError(error.message);
      }
    }

    loadOrder();
  }, [orderId]);

  if (error) {
    return (
      <main className="empty-cart-page">
        <div className="empty-cart-icon">
          ⚠️
        </div>

        <h1>Order not found</h1>

        <p>
          {error}
        </p>

        <Link
          to="/"
          className="primary-button"
        >
          Continue shopping
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <div className="page-loading">
        Loading order...
      </div>
    );
  }

  return (
    <main className="empty-cart-page">
      <div className="empty-cart-icon">
        ✓
      </div>

      <h1>Order confirmed!</h1>

      <p>
        Thank you for your purchase.
      </p>

      <p>
        Order ID:{" "}
        <strong>{order.id}</strong>
      </p>

      <p>
        Subtotal:{" "}
        <strong>
          ${(order.subtotal_cents / 100).toFixed(2)}
        </strong>
      </p>

      {order.discount_cents > 0 && (
        <p>
          Discount:{" "}
          <strong>
            -${(order.discount_cents / 100).toFixed(2)}
          </strong>
        </p>
      )}

      <p>
        Shipping:{" "}
        <strong>
          {order.shipping_cents === 0
            ? "FREE"
            : `$${(order.shipping_cents / 100).toFixed(2)}`}
        </strong>
      </p>

      <p>
        Tax:{" "}
        <strong>
          ${(order.tax_cents / 100).toFixed(2)}
        </strong>
      </p>

      <p>
        Total:{" "}
        <strong>
          ${(order.total_cents / 100).toFixed(2)}
        </strong>
      </p>

      <Link
        to="/"
        className="primary-button"
      >
        Continue shopping
      </Link>
    </main>
  );
}

export default Confirmation;