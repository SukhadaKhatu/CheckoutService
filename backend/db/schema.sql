CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- PRODUCTS
-- ============================================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    -- All money is stored in cents.
    -- Example: $99.99 -> 9999
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),

    available_inventory INTEGER NOT NULL
        CHECK (available_inventory >= 0),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================
-- CARTS
-- ============================================

CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT carts_status_check
        CHECK (status IN ('ACTIVE', 'CHECKED_OUT'))
);


-- ============================================
-- CART ITEMS
-- ============================================

CREATE TABLE cart_items (
    cart_id UUID NOT NULL,
    product_id UUID NOT NULL,

    quantity INTEGER NOT NULL
        CHECK (quantity > 0),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    PRIMARY KEY (cart_id, product_id),

    FOREIGN KEY (cart_id)
        REFERENCES carts(id)
        ON DELETE CASCADE,

    FOREIGN KEY (product_id)
        REFERENCES products(id)
);


-- ============================================
-- ORDERS
-- ============================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cart_id UUID NOT NULL UNIQUE,

    subtotal_cents INTEGER NOT NULL
        CHECK (subtotal_cents >= 0),

    discount_cents INTEGER NOT NULL DEFAULT 0
        CHECK (discount_cents >= 0),

    tax_cents INTEGER NOT NULL DEFAULT 0
        CHECK (tax_cents >= 0),

    shipping_cents INTEGER NOT NULL DEFAULT 0
        CHECK (shipping_cents >= 0),

    total_cents INTEGER NOT NULL
        CHECK (total_cents >= 0),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (cart_id)
        REFERENCES carts(id)
);


-- ============================================
-- ORDER ITEMS
-- ============================================

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL,

    product_id UUID NOT NULL,

    -- Snapshot of product information at checkout.
    -- This is important because the product can change later.
    product_name VARCHAR(255) NOT NULL,

    unit_price_cents INTEGER NOT NULL
        CHECK (unit_price_cents >= 0),

    quantity INTEGER NOT NULL
        CHECK (quantity > 0),

    line_total_cents INTEGER NOT NULL
        CHECK (line_total_cents >= 0),

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE
);


-- ============================================
-- COUPONS
-- ============================================

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code VARCHAR(100) NOT NULL UNIQUE,

    discount_percent INTEGER NOT NULL
        CHECK (
            discount_percent > 0
            AND discount_percent <= 100
        ),

    -- Example:
    -- milestone 5 -> 5th successful order
    -- milestone 10 -> 10th successful order
    milestone_order_number INTEGER NOT NULL UNIQUE,

    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',

    redeemed_order_id UUID,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    redeemed_at TIMESTAMP,

    CONSTRAINT coupons_status_check
        CHECK (status IN ('AVAILABLE', 'REDEEMED')),

    FOREIGN KEY (redeemed_order_id)
        REFERENCES orders(id)
);


-- ============================================
-- CHECKOUT IDEMPOTENCY
-- ============================================

CREATE TABLE checkout_idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cart_id UUID NOT NULL,

    idempotency_key VARCHAR(255) NOT NULL,

    order_id UUID,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE (cart_id, idempotency_key),

    FOREIGN KEY (cart_id)
        REFERENCES carts(id)
        ON DELETE CASCADE,

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
);


-- ============================================
-- REWARD CONFIGURATION
-- ============================================

CREATE TABLE reward_config (
    id INTEGER PRIMARY KEY,

    milestone_every_n_orders INTEGER NOT NULL
        CHECK (milestone_every_n_orders > 0),

    discount_percent INTEGER NOT NULL
        CHECK (
            discount_percent > 0
            AND discount_percent <= 100
        ),

    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT reward_config_single_row
        CHECK (id = 1)
);