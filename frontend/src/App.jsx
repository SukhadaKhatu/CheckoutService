import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import ProductList from "./components/ProductList";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";
import Confirmation from "./components/Confirmation";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app">

        <header className="navbar">
          <Link to="/" className="logo">
            ShopEasy
          </Link>

          <nav>
            <Link to="/">Shop</Link>
            <Link to="/cart">Cart</Link>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<ProductList />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/confirmation/:orderId"   element={<Confirmation />}
/>
        </Routes>

      </div>
    </BrowserRouter>
  );
}

export default App;