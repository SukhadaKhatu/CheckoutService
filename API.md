# API Documentation

## Overview

This document describes the implemented HTTP API for the Reliable Checkout and Rewards Service.

### Base URL

```text
http://localhost:3000/api
```

### API Conventions

- Request and response bodies use JSON.
- Product and cart quantities must be positive integers.
- Money is represented as integer cents to avoid floating-point rounding errors.
- Checkout requires an `Idempotency-Key` header.
- Admin endpoints are intentionally unauthenticated for this take-home assignment. In production, they would require authorization.

---

# Products

## 1. List Products

### Request

```http
GET /api/products
```

### Response

```json
{
  "products": [
    {
      "id": "product-uuid",
      "name": "Wireless Headphones",
      "price_cents": 9999,
      "available_inventory": 3
    }
  ]
}
```

### Status Codes

| Status | Meaning |
|---|---|
| `200` | Products retrieved successfully |
| `500` | Internal server error |

---

# Carts

## 2. Create Cart

### Request

```http
POST /api/carts
```

No request body is required.

### Response

```json
{
  "cart": {
    "id": "cart-uuid",
    "status": "ACTIVE",
    "created_at": "2026-10-07T11:00:00.000Z"
  }
}
```

### Status Codes

| Status | Meaning |
|---|---|
| `201` | Cart created successfully |
| `500` | Internal server error |

---

## 3. Get Cart

### Request

```http
GET /api/carts/:cartId
```

Example:

```http
GET /api/carts/060f4d23-6a94-42a4-a503-aa059af94571
```

### Response

```json
{
  "cart": {
    "id": "cart-uuid",
    "status": "ACTIVE",
    "items": [
      {
        "productId": "product-uuid",
        "productName": "Wireless Mouse",
        "unitPriceCents": 4999,
        "quantity": 2,
        "lineTotalCents": 9998,
        "availableInventory": 15
      }
    ],
    "itemCount": 2,
    "subtotalCents": 9998,
    "shippingCents": 899,
    "taxCents": 800,
    "totalCents": 11697
  }
}
```

### Status Codes

| Status | Meaning |
|---|---|
| `200` | Cart retrieved successfully |
| `404` | Cart does not exist |
| `500` | Internal server error |

---

## 4. Add Item to Cart

### Request

```http
POST /api/carts/:cartId/items
Content-Type: application/json
```

### Body

```json
{
  "productId": "product-uuid",
  "quantity": 2
}
```

### Behavior

- Quantity must be a positive integer.
- Product must exist.
- Cart must exist and be active.
- If the product already exists in the cart, the requested quantity is added to the existing quantity.
- The resulting quantity cannot exceed current inventory.
- Inventory is **not reserved** when an item is added to the cart.
- Final inventory validation happens during checkout.

### Response

Returns the updated cart using the same structure as `GET /api/carts/:cartId`.

### Possible Errors

| Error Code | Meaning |
|---|---|
| `INVALID_QUANTITY` | Quantity is not a positive integer |
| `CART_NOT_FOUND` | Cart does not exist |
| `CART_ALREADY_CHECKED_OUT` | Cart has already been checked out |
| `PRODUCT_NOT_FOUND` | Product does not exist |
| `INSUFFICIENT_INVENTORY` | Requested quantity exceeds available inventory |

---

## 5. Update Cart Item

### Request

```http
PATCH /api/carts/:cartId/items/:productId
Content-Type: application/json
```

### Body

```json
{
  "quantity": 3
}
```

### Behavior

The quantity replaces the existing cart quantity.

The quantity must be a positive integer and cannot exceed current product inventory.

### Response

Returns the updated cart.

### Possible Errors

| Error Code | Meaning |
|---|---|
| `INVALID_QUANTITY` | Quantity is not a positive integer |
| `CART_NOT_FOUND` | Cart does not exist |
| `CART_ALREADY_CHECKED_OUT` | Cart has already been checked out |
| `PRODUCT_NOT_FOUND` | Product does not exist |
| `CART_ITEM_NOT_FOUND` | Product is not currently in the cart |
| `INSUFFICIENT_INVENTORY` | Requested quantity exceeds available inventory |

---

## 6. Remove Cart Item

### Request

```http
DELETE /api/carts/:cartId/items/:productId
```

### Response

Returns the updated cart.

### Possible Errors

| Error Code | Meaning |
|---|---|
| `CART_NOT_FOUND` | Cart does not exist |
| `CART_ALREADY_CHECKED_OUT` | Cart has already been checked out |
| `CART_ITEM_NOT_FOUND` | Product is not currently in the cart |

---

# Checkout

## 7. Checkout Cart

### Request

```http
POST /api/carts/:cartId/checkout
Content-Type: application/json
Idempotency-Key: <unique-key>
```

### Body

Coupon is optional.

Without a coupon:

```json
{}
```

With a coupon:

```json
{
  "couponCode": "REWARD-5-2E7B89FEC3BB"
}
```

### Idempotency

The `Idempotency-Key` header is required.

The key is scoped to the cart:

```text
(cart_id, idempotency_key)
```

If the same cart is checked out again using the same idempotency key, the existing order is returned instead of creating another order.

This prevents duplicate:

- orders
- inventory deductions
- coupon redemptions

This also makes retrying a request after a timeout or lost response safe.

### Checkout Behavior

Checkout runs as a database transaction.

The transaction:

1. Locks the cart.
2. Checks whether the cart has already been checked out.
3. Checks the idempotency key.
4. Reads the cart items.
5. Locks all required product rows in deterministic order.
6. Re-validates inventory.
7. Calculates the current product prices.
8. Validates and locks the optional coupon.
9. Calculates subtotal, discount, tax, shipping, and total.
10. Deducts inventory.
11. Creates the order.
12. Creates immutable order-item snapshots.
13. Redeems the coupon, if applicable.
14. Marks the cart as checked out.
15. Stores the idempotency key.
16. Commits the transaction.

If any step fails, the entire transaction is rolled back.

### Pricing Semantics

Product prices are **not locked when the product is added to the cart**.

The price used for checkout is the product's current price at checkout.

For example:

```text
Product added to cart: $49.99
Product price before checkout: $54.99
Final checkout price: $54.99
```

The resulting order stores the charged price in `order_items`, so the historical order remains explainable even if the product changes later.

### Tax and Shipping

The implemented rules are:

```text
Tax = 8% of subtotal, rounded to the nearest cent.

Shipping = $0 when subtotal >= $100.00
           $8.99 otherwise.
```

### Coupon Discount

The coupon percentage is applied to the subtotal:

```text
discount = round(subtotal * discount_percentage / 100)
```

The final total is never allowed to become negative.

### Successful Checkout

A successful checkout is treated as successful payment for this assignment.

No external payment provider is integrated because payment processing is outside the scope of the exercise.

### Response

```json
{
  "order": {
    "id": "order-uuid",
    "cart_id": "cart-uuid",
    "subtotal_cents": 4999,
    "discount_cents": 0,
    "tax_cents": 400,
    "shipping_cents": 899,
    "total_cents": 6298,
    "created_at": "2026-10-07T11:40:24.884Z",
    "items": [
      {
        "id": "order-item-uuid",
        "product_id": "product-uuid",
        "product_name": "Wireless Mouse",
        "unit_price_cents": 4999,
        "quantity": 1,
        "line_total_cents": 4999
      }
    ]
  }
}
```

### Possible Errors

| Error Code | Meaning |
|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | Checkout request did not include an idempotency key |
| `CART_NOT_FOUND` | Cart does not exist |
| `CART_ALREADY_CHECKED_OUT` | Cart has already been checked out |
| `EMPTY_CART` | Cart contains no items |
| `PRODUCT_NOT_FOUND` | A product in the cart no longer exists |
| `INSUFFICIENT_INVENTORY` | Current inventory cannot satisfy the cart |
| `COUPON_NOT_FOUND` | Supplied coupon does not exist |
| `COUPON_ALREADY_REDEEMED` | Supplied coupon has already been redeemed |

---

# Orders

## 8. Get Order

### Request

```http
GET /api/orders/:orderId
```

### Response

```json
{
  "order": {
    "id": "order-uuid",
    "cart_id": "cart-uuid",
    "subtotal_cents": 4999,
    "discount_cents": 0,
    "tax_cents": 400,
    "shipping_cents": 899,
    "total_cents": 6298,
    "created_at": "2026-10-07T11:40:24.884Z",
    "items": [
      {
        "id": "order-item-uuid",
        "product_id": "product-uuid",
        "product_name": "Wireless Mouse",
        "unit_price_cents": 4999,
        "quantity": 1,
        "line_total_cents": 4999
      }
    ]
  }
}
```

Order items contain immutable snapshots of:

- Product ID
- Product name
- Unit price
- Quantity
- Line total

This allows an order to remain understandable even if the product name or price changes later.

### Status Codes

| Status | Meaning |
|---|---|
| `200` | Order retrieved successfully |
| `404` | Order does not exist |
| `500` | Internal server error |

---

# Admin - Coupons

## 9. Generate Reward Coupon

### Request

```http
POST /api/admin/coupons/generate
```

No request body is required.

### Reward Rules

The reward configuration is:

```text
Every N successful orders -> one X% coupon
```

The seeded configuration is:

```text
N = 5
X = 10%
```

Therefore:

```text
5 successful orders  -> 10% coupon
10 successful orders -> another 10% coupon
15 successful orders -> another 10% coupon
...
```

Coupon generation is explicitly requested through the admin endpoint.

A coupon is generated only when:

- the corresponding order milestone has been reached, and
- a coupon for that milestone has not already been generated.

Concurrent coupon-generation requests are serialized using a database lock on the reward configuration row, and the database also enforces uniqueness on the milestone.

### Successful Generation Response

```json
{
  "generated": true,
  "successfulOrderCount": 5,
  "coupon": {
    "id": "coupon-uuid",
    "code": "REWARD-5-2E7B89FEC3BB",
    "discount_percent": 10,
    "milestone_order_number": 5,
    "status": "AVAILABLE"
  }
}
```

### No Eligible Milestone

```json
{
  "generated": false,
  "reason": "MILESTONE_NOT_REACHED",
  "successfulOrderCount": 3
}
```

or:

```json
{
  "generated": false,
  "reason": "ALL_MILESTONES_ALREADY_GENERATED",
  "successfulOrderCount": 10
}
```

### Coupon Redemption

Coupons are redeemed during the checkout transaction.

A coupon is only changed from `AVAILABLE` to `REDEEMED` if checkout succeeds.

If checkout fails, the transaction rolls back and the coupon remains available.

The database row is locked during checkout so concurrent requests cannot redeem the same coupon twice.

---

# Admin - Reporting

## 10. Get Report

### Request

```http
GET /api/admin/reports
```

### Response

```json
{
  "report": {
    "successfulOrderCount": 5,
    "grossRevenueCents": 34995,
    "totalDiscountsCents": 1000,
    "netRevenueCents": 33995,
    "products": [
      {
        "productId": "product-uuid",
        "productName": "Wireless Mouse",
        "quantityPurchased": 5,
        "grossSalesCents": 24995
      }
    ],
    "coupons": {
      "generated": 1,
      "available": 0,
      "redeemed": 1
    }
  }
}
```

### Report Definitions

| Field | Definition |
|---|---|
| `successfulOrderCount` | Number of successfully created orders |
| `grossRevenueCents` | Sum of order subtotals before discounts |
| `totalDiscountsCents` | Sum of discounts applied to successful orders |
| `netRevenueCents` | Sum of final order totals |
| `quantityPurchased` | Total quantity purchased for each product |
| `grossSalesCents` | Product sales before order-level discounts |
| `coupons.generated` | Total coupons generated |
| `coupons.available` | Generated coupons that have not been redeemed |
| `coupons.redeemed` | Coupons used successfully |

The report is read-only and does not modify orders, inventory, carts, or coupons.

---

# Error Model

API errors use a structured format:

```json
{
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Insufficient inventory"
  }
}
```

The `code` is intended for programmatic handling by clients, while `message` provides a human-readable explanation.

Examples of domain-specific error codes include:

- `CART_NOT_FOUND`
- `CART_ALREADY_CHECKED_OUT`
- `PRODUCT_NOT_FOUND`
- `INVALID_QUANTITY`
- `CART_ITEM_NOT_FOUND`
- `INSUFFICIENT_INVENTORY`
- `EMPTY_CART`
- `IDEMPOTENCY_KEY_REQUIRED`
- `COUPON_NOT_FOUND`
- `COUPON_ALREADY_REDEEMED`
- `ORDER_NOT_FOUND`

---

# API Summary

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/products` | List products |
| `POST` | `/api/carts` | Create cart |
| `GET` | `/api/carts/:cartId` | Retrieve cart |
| `POST` | `/api/carts/:cartId/items` | Add product to cart |
| `PATCH` | `/api/carts/:cartId/items/:productId` | Update cart quantity |
| `DELETE` | `/api/carts/:cartId/items/:productId` | Remove cart item |
| `POST` | `/api/carts/:cartId/checkout` | Checkout cart |
| `GET` | `/api/orders/:orderId` | Retrieve order |
| `POST` | `/api/admin/coupons/generate` | Generate eligible coupon |
| `GET` | `/api/admin/reports` | Retrieve admin report |

**Total implemented endpoints: 10**
