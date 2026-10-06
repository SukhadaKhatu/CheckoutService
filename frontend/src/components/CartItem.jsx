function CartItem({
  item,
  onIncrease,
  onDecrease,
  onRemove,
}) {
  const lineTotal = item.unitPrice * item.quantity;

  return (
    <div className="cart-item">
      <div className="cart-item-info">
        <h3>{item.productName}</h3>

        <p>
          ${item.unitPrice.toFixed(2)} each
        </p>
      </div>

      <div className="quantity-controls">
        <button
          onClick={() => onDecrease(item.productId)}
        >
          −
        </button>

        <span>{item.quantity}</span>

        <button
          onClick={() => onIncrease(item.productId)}
        >
          +
        </button>
      </div>

      <div className="line-total">
        ${lineTotal.toFixed(2)}
      </div>

      <button
        className="remove-button"
        onClick={() => onRemove(item.productId)}
      >
        Remove
      </button>
    </div>
  );
}

export default CartItem;