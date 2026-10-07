import { Link, useLocation } from "react-router-dom";

function Confirmation() {
  const location = useLocation();

  const order = location.state?.order;

  if (!order) {
    return (
      <main className="empty-cart-page">
        <div className="empty-cart-icon">
          ⚠️
        </div>

        <h1>Order not found</h1>

        <p>
          We couldn't find the order details.
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
        Total:{" "}
        <strong>
          $
          {(order.total_cents / 100).toFixed(2)}
        </strong>
      </p>

      {order.discount_cents > 0 && (
        <p>
          Discount:{" "}
          <strong>
            $
            {(order.discount_cents / 100).toFixed(2)}
          </strong>
        </p>
      )}

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