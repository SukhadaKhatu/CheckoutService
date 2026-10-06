import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getProducts, addItem } from "../api";

function ProductList() {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProducts() {
      const data = await getProducts();
      setProducts(data);
    }

    loadProducts();
  }, []);

  async function handleAdd(productId) {
    try {
      await addItem(productId, 1);

      setMessage("Added to cart");

      setTimeout(() => {
        setMessage("");
      }, 2000);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="shop-page">

      <section className="hero">
        <div>
          <p className="eyebrow">WELCOME TO SHOPEASY</p>

          <h1>
            Everything you need,
            <br />
            delivered to you.
          </h1>

          <p>
            Quality products. Simple shopping.
            Reliable checkout.
          </p>
        </div>
      </section>

      <div className="shop-header">
        <div>
          <h2>Popular products</h2>
          <p>Explore our latest products</p>
        </div>

        <Link to="/cart" className="cart-link">
          View cart →
        </Link>
      </div>

      {message && (
        <div className="toast">
          ✓ {message}
        </div>
      )}

      <section className="product-grid">

        {products.map((product) => (
          <article
            className="product-card"
            key={product.id}
          >

            <div className="product-image">
              <span>
                {product.name.charAt(0)}
              </span>
            </div>

            <div className="product-details">

              <h3>{product.name}</h3>

              <div className="rating">
                ★★★★★
                <span>(128)</span>
              </div>

              <div className="product-price">
                ${product.price.toFixed(2)}
              </div>

              <p className="stock">
                {product.availableQuantity > 0
                  ? "In stock"
                  : "Out of stock"}
              </p>

              <button
                className="add-button"
                onClick={() => handleAdd(product.id)}
                disabled={product.availableQuantity === 0}
              >
                Add to cart
              </button>

            </div>

          </article>
        ))}

      </section>

    </main>
  );
}

export default ProductList;