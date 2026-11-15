# ShopSmart API examples

Start the application with `npm run dev`, then send these requests through Bruno or another authorized API client.

## Health check

```http
GET http://localhost:3000/api/health
```

## Product list

```http
GET http://localhost:3000/api/products
```

## One product

```http
GET http://localhost:3000/api/products/1
```

## Create a fictional account (sets the session cookie)

```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "name": "Ana Reyes",
  "email": "ana@example.com",
  "password": "Demo-pass-123"
}
```

`POST /api/auth/login` takes `email` and `password`; `POST /api/auth/logout` ends the session; `GET /api/auth/me` returns the signed-in customer or 401. The session is an httpOnly cookie, so send requests with the cookie (`credentials: 'include'` in fetch).

## Create a simulated order (signed in)

```http
POST http://localhost:3000/api/orders
Content-Type: application/json
Cookie: shopsmart_session=<from the register or login response>

{
  "customerName": "Ana Reyes",
  "address": "Angeles City, Pampanga",
  "items": [
    { "productId": 1, "quantity": 1 },
    { "productId": 2, "quantity": 1 }
  ]
}
```

The server ignores prices from the browser and reads authoritative prices from PostgreSQL. The order email comes from the signed-in account.

## Read orders

- `GET /api/orders`: the signed-in customer's own orders.
- `GET /api/orders/:id`: 200 for the owner, 401 for a guest, 403 `ORDER_FORBIDDEN` for any other customer.

## Ask the starter assistant

```http
POST http://localhost:3000/api/assistant/questions
Content-Type: application/json

{
  "question": "Which keyboard is below ₱2,000?"
}
```
