# Design Decisions

## 1. Overview

This service is designed to make checkout predictable and correct under retries, concurrent requests, inventory changes, and coupon contention.

The main design goal is to protect correctness-critical state using PostgreSQL transactions, row-level locks, database constraints, and durable idempotency records rather than relying on application-memory coordination.

The implementation intentionally favors correctness and understandable failure behavior over premature optimization.

---

## 2. Core Invariants

### Inventory

1. Inventory must never become negative.
2. A successful checkout deducts inventory exactly once.
3. Concurrent checkouts cannot oversell the same product.
4. Inventory is revalidated at checkout time because cart contents do not reserve inventory.

### Carts and Orders

5. An active cart can be successfully checked out only once.
6. A checked-out cart cannot be modified.
7. A successful checkout creates exactly one order.
8. Retrying checkout with the same cart and idempotency key returns the same order.
9. Orders retain immutable product name, unit price, quantity, and line total snapshots.

### Coupons

10. A reward milestone can generate at most one coupon.
11. A coupon can be redeemed at most once.
12. A failed checkout must not consume a coupon.
13. Concurrent checkouts cannot redeem the same coupon twice.

### Money

14. Monetary values are stored and calculated as integer cents.
15. Order totals can never become negative.

### Reporting

16. Reporting operations are read-only and do not modify checkout state.

---

# 3. Ambiguities and Chosen Semantics

The assignment leaves several business rules unspecified. The following semantics were chosen explicitly.

## 3.1 Product Price Changes

### Context

A product's price can change after it has been added to a cart but before checkout.

### Choice

The current product price at checkout is used.

The cart does not reserve or lock the product price.

The final price charged is stored in the order item snapshot.

### Why

This keeps carts simple and avoids requiring price reservations or expiration rules.

The order remains explainable because the exact charged price is persisted.

### Consequence

A customer may see one price when adding an item and a different price at checkout if the product price changes in between.

---

## 3.2 Inventory Reservation

### Context

The assignment requires preventing overselling but does not require inventory to be reserved when an item is added to a cart.

### Choice

Inventory is not reserved when adding items to a cart.

Inventory is checked during cart operations for useful feedback, but the authoritative inventory check and deduction happen during checkout.

### Why

This avoids holding inventory for abandoned carts and eliminates the need for cart reservation expiry logic.

### Consequence

A cart can contain an item that is no longer available when checkout occurs.

In that situation checkout fails with `INSUFFICIENT_INVENTORY`.

---

## 3.3 Tax

### Context

The assignment does not specify a tax calculation.

### Choice

A fixed 8% tax is applied to the subtotal.

tax = round(subtotal_cents * 8 / 100)

### Why

This provides deterministic behavior without introducing external tax-service dependencies.

### Consequence

This is a simplified assignment rule rather than a production tax implementation.

## 3.4 Shipping

### Context

Shipping behavior is not specified.

### Choice

Shipping is:
- Free when subtotal is at least $100.
- Otherwise $8.99.
Shipping is calculated from the subtotal before discounts.
```
if subtotal >= 10000 cents:
    shipping = 0
else:
    shipping = 899 cents
```

### Why

This provides deterministic checkout totals while keeping the implementation simple.

## 3.5 Coupon Discount

### Context

The assignment specifies percentage-based coupons but does not define exactly what amount the percentage applies to.

### Choice

The percentage discount applies to the subtotal only.

```
discount = round(subtotal_cents * discount_percent / 100)
```

The final total is:
```
total =
    max(
        0,
        subtotal + tax + shipping - discount
    )
```

### Why

Applying the discount to the subtotal gives a simple and predictable rule.
The max(0, ...) guard ensures the total can never become negative.

## 3.6 Reward Coupon Generation

### Context

The assignment says an admin can request coupon generation when a reward milestone has been reached.

### Choice

Coupon generation is an explicit admin operation.
Reaching a milestone does not automatically create a coupon.
When the admin requests generation, the service finds the earliest reached milestone that does not already have a coupon and creates it.

### Why

This directly matches the requested admin workflow and makes coupon generation deterministic.

### Consequence

A reward can be eligible but not yet generated until the admin endpoint is called.

## 3.7 Successful Checkout and Payment

### Context

The assignment does not require integration with a real payment provider.

### Choice

A successful checkout is treated as a successful payment.
No real payment provider is integrated.

### Why

The assignment explicitly says that real payment is not required. Adding a payment provider would introduce external dependencies and additional failure modes without improving the core checkout/rewards problem.

### Consequence

The implementation is not intended to model real payment authorization, capture, refunds, or payment-provider webhooks.

# 4. Material Design Decisions

## 4.1 PostgreSQL for Transactional State

### Context

Checkout modifies several pieces of related state:
- inventory
- cart status
- order
- order items
- coupon
- idempotency record
These changes must remain consistent even when requests overlap or fail.

### Options

1. In-memory state
2. File-based persistence
3. PostgreSQL
4. Separate databases for different domains

### Choice

Use PostgreSQL as the source of truth for all correctness-critical state.

### Why

PostgreSQL provides:
- ACID transactions
- row-level locking
- unique constraints
- foreign keys
- durable persistence
- good support for concurrent transactions
This allows checkout to update all related state atomically.

### Consequences

The application depends on PostgreSQL, but correctness is significantly stronger than with process-local state.
The design also works across multiple backend instances because concurrency coordination happens in the database.

## 4.2 Integer Cents for Money

### Context

Floating-point arithmetic can introduce rounding errors when representing monetary values.

### Options

1. JavaScript floating-point numbers
2. PostgreSQL numeric/decimal everywhere
3. Integer cents

### Choice

Represent money as integer cents

### Why

Integer arithmetic provides deterministic monetary calculations without floating-point precision problems.

### Consequences
API consumers must understand that monetary fields such as subtotal_cents are represented in cents.

## 4.3 One Database Transaction for Checkout
### Context
Checkout modifies multiple records that must remain consistent.

### Choice
The checkout flow runs inside a single PostgreSQL transaction. If any step fails then rollback

### Why
This prevents partial checkout state.
For example, if coupon redemption fails after inventory was deducted, the entire transaction rolls back, including the inventory deduction.

### Consequences
Transactions may hold locks for the duration of checkout, so transaction duration and lock contention should be monitored in a production environment.

## 4.4 Row Locks for Inventory

### Context
Two customers may attempt to purchase the last unit of the same product concurrently.

### Choice
Product rows are locked. Inventory is then rechecked while holding the lock.

### Why
The database serializes conflicting inventory updates. This prevents overselling.

### Consequences

Concurrent checkouts for the same product may wait for one another.
This is preferable to allowing incorrect inventory.

## 4.5 Deterministic Product Lock Order
## Context
A checkout can contain multiple products.
Different transactions could otherwise acquire product locks in different orders, increasing the risk of deadlocks.

## Choice
Product rows are locked in deterministic id order.

## Why
If two transactions need the same set of product locks, they attempt to acquire those locks in the same order.

## Consequences
This reduces deadlock risk but does not eliminate every possible database deadlock in a larger system.
Production code should still detect and appropriately handle transaction retries for serialization/deadlock failures if necessary.

## 4.6 Database-Backed Idempotency

### Context
A client may successfully submit checkout but fail to receive the response because of a timeout or network failure.
Retrying must not create another order or deduct inventory again.

### Options
1. Application-memory idempotency cache
2. Redis
3. Database-backed idempotency records

### Choice
Use a PostgreSQL checkout_idempotency_keys table.
The uniqueness constraint is: (cart_id, idempotency_key)

### Why
The idempotency state is durable and shared across all application instances.
If a request is retried with the same cart and idempotency key, the existing order is returned.

### Consequences
The client must provide an Idempotency-Key header for checkout.
A failed transaction does not permanently consume the idempotency key because the entire transaction is rolled back.

## 4.7 Immutable Order Item Snapshots

### Context
Product information can change after an order is placed.
A historical order should still explain what the customer purchased and what price they were charged.

### Choice
Each order item stores:
- product ID
- product name
- unit price in cents
- quantity
- line total in cents

### Why
The order becomes a historical snapshot independent of future product changes.

### Consequences
The order item contains some duplicated product information, but this duplication is intentional for historical correctness.

## 4.8 Serialize Coupon Generation

### Context
Two admin requests could attempt to generate the same milestone coupon concurrently.

### Choice
The coupon table also has a unique constraint on milestone_order_number

### Why
The row lock serializes generation decisions, while the unique constraint provides an additional database-level invariant.

### Consequences
Concurrent generation requests are serialized, but coupon generation is an infrequent administrative operation, so this contention is acceptable.

# 5. Transaction, Concurrency, and Idempotency Model

## Checkout Transaction
The checkout transaction follows this sequence:
1. Begin transaction.
2. Lock the cart.
3. Check whether the cart/idempotency-key combination already has an order.
4. Reject already checked-out carts when appropriate.
5. Read cart items.
6. Lock all relevant product rows in deterministic order.
7. Recheck inventory.
8. Lock the requested coupon if one was provided.
9. Calculate subtotal, tax, shipping, discount, and total.
10. Deduct inventory.
11. Create the order.
12. Create immutable order item snapshots.
13. Redeem the coupon if applicable.
14. Mark the cart as checked out.
15. Store the idempotency result.
16. Commit.
Any error causes the transaction to roll back.

# 6. Error Model
The API uses structured application errors.

Current application error codes include:
- CART_NOT_FOUND
- CART_ALREADY_CHECKED_OUT
- PRODUCT_NOT_FOUND
- INVALID_QUANTITY
- CART_ITEM_NOT_FOUND
- INSUFFICIENT_INVENTORY
- EMPTY_CART
- IDEMPOTENCY_KEY_REQUIRED
- COUPON_NOT_FOUND
- COUPON_ALREADY_REDEEMED
- ORDER_NOT_FOUND

# 7. Implemented vs Deferred

## Implemented
The current implementation includes:
- PostgreSQL persistence
- Product catalog
- Inventory management
- Cart creation and modification
- Cart lifecycle
- Checkout transactions
- Row-level inventory locking
- Deterministic lock ordering
- Database-backed idempotency
- Coupon generation
- Coupon redemption
- Coupon concurrency protection
- Coupon rollback on failed checkout
- Immutable order snapshots
- Integer-cent monetary calculations
- Tax and shipping calculations
- Structured application errors
- Order retrieval
- Admin reporting
- Frontend checkout and confirmation flow
- API documentation
- Concurrency and retry validation

## Deferred
The following are intentionally outside the assignment scope:
- Authentication and authorization
- Real payment provider integration
- Inventory reservation while items remain in a cart
- Distributed cache
- Customer accounts
- Production-grade observability stack
- Refunds and payment reconciliation
- External tax service
- Rate limiting
- Advanced fraud detection
These can be added without changing the core correctness model.

## 8. Multiple Instances and Production Scale
The implementation does not rely on process-local state for correctness.
This means multiple backend instances can safely process concurrent requests because:
- inventory state is in PostgreSQL
- cart state is in PostgreSQL
- coupon state is in PostgreSQL
- orders are in PostgreSQL
- idempotency records are in PostgreSQL
- row-level locks are enforced by PostgreSQL
For production, I would additionally consider:
- managed PostgreSQL with backups and failover
- connection pool sizing
- transaction and lock monitoring
- appropriate database indexes
- query-plan analysis
- structured logging
- distributed tracing
- request IDs
- metrics for checkout success/failure
- inventory contention metrics
- coupon generation/redeeming metrics
- authentication and authorization
- rate limiting
- payment-provider idempotency
- inventory reservation if the business requires it

## 9. AI Tool Use and Engineering Ownership
AI assistance was useful for:
- brainstorming implementation approaches
- identifying edge cases
- suggesting test scenarios
- generating boilerplate
- reviewing API/documentation structure
- checking concurrency scenarios

## 10. Testing Strategy
The implementation was validated against the most important correctness scenarios like basic checkout, Idempotency Retry and Concurrent inventory contention.

## 11. What I Would Examine First With Another Two Hours
I would expand Automated Concurrency Tests, reeview HTTP Error/Status Consistency and add API contract tests and add observibility

## 12. Summary
This design prioritizes:
1. No inventory overselling
2. Exactly-once behavior for retried checkout requests
3. Atomic order creation
4. Safe coupon redemption
5. Deterministic monetary calculations
6. Explainable historical orders
7. Database-enforced invariants
8. Predictable failure and rollback behavior



