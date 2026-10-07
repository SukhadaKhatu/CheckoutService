-- ============================================
-- PRODUCTS
-- ============================================

INSERT INTO products
    (id, name, price_cents, available_inventory)
VALUES
(
    '11111111-1111-1111-1111-111111111111',
    'Wireless Headphones',
    9999,
    3
),
(
    '22222222-2222-2222-2222-222222222222',
    'Mechanical Keyboard',
    14999,
    10
),
(
    '33333333-3333-3333-3333-333333333333',
    'USB-C Charger',
    3999,
    25
),
(
    '44444444-4444-4444-4444-444444444444',
    'Laptop Stand',
    5999,
    8
),
(
    '55555555-5555-5555-5555-555555555555',
    'Wireless Mouse',
    4999,
    15
);


-- ============================================
-- REWARD CONFIGURATION
-- ============================================

INSERT INTO reward_config
    (id, milestone_every_n_orders, discount_percent)
VALUES
(
    1,
    5,
    10
);