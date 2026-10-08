# Reliable Checkout and Rewards Service

A full-stack ecommerce checkout and rewards service built with React, Node.js, Express, and PostgreSQL.

The application supports product inventory, carts, checkout, idempotent retries, concurrent inventory protection, reward coupons, order history, and admin reporting.

---

## Tech Stack

### Frontend
- React
- Vite
- JavaScript
- CSS

### Backend
- Node.js
- Express
- PostgreSQL
- `pg` PostgreSQL client

### Database
- PostgreSQL

---

# Prerequisites

Before running the application, make sure the following are installed:

- Node.js 18+
- npm
- PostgreSQL 14+
- Git

You can verify the installations with:

```
node --version
npm --version
psql --version
git --version
```

## Database Setup
The application uses PostgreSQL for persistent state.

## 1. Create the database
Create a PostgreSQL database named: checkout_rewards

## 2. Run the database schema
From the project root run:
```
psql -d checkout_rewards -f backend/db/schema.sql
```

## 3. Seed the database
Run:
```
psql -d checkout_rewards -f backend/db/seed.sql
```

## Backend setup
```
cd backend
npm install
Create file named backed/.env
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:YOUR_PORT/checkout_rewards
CORS_ORIGIN=http://localhost:5173

Replace YOUR_PASSWORD and YOUR_PORT

Start backend:
npm run dev
```

## Frontend setup

```
cd frontend
npm install
npm run dev
Go to the url provided: http://localhost:5173
Open the url in browser
```

## Running the application
Terminal 1: Backend
```
cd backend
npm install
npm run dev
```

Terminal 2: Frontend
```
cd frontend
npm install
npm run dev
```

Then open the frontend url in a browser

## Running tests
### Backend
```
cd backend
npm test
```

### Frontend
```
cd frontend
npm test
```