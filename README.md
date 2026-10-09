# nAPI — Node.js CRUD REST API with SQL Server

A minimal Express + mssql REST API with full CRUD operations for a `users` resource, connected to a local SQL Server instance.

---

## Project Structure

```
nAPI/
├── schema.sql              ← Run once to create the DB & table
├── .env                    ← Your local config (git-ignored)
├── .env.example            ← Template for environment variables
└── src/
    ├── app.js              ← Entry point
    ├── config/
    │   └── db.js           ← SQL Server connection pool
    ├── models/
    │   └── user.model.js   ← T-SQL queries
    ├── controllers/
    │   └── user.controller.js
    ├── routes/
    │   └── user.routes.js
    └── middlewares/
        └── errorHandler.js
```

---

## Setup

### 1. Create the database & table

Run `schema.sql` against your SQL Server instance using `sqlcmd`:

```bash
sqlcmd -S "COM-6Q5NXH2\SQLEXPRESS2019" -E -i schema.sql
```

`-E` uses Windows Authentication (trusted connection). Use `-U sa -P <password>` for SQL login instead.

### 2. Configure environment

Edit `.env`:

```env
PORT=3000

DB_SERVER=COM-6Q5NXH2\SQLEXPRESS2019
DB_PORT=1433
DB_USER=                        # leave blank when using Windows Auth
DB_PASSWORD=                    # leave blank when using Windows Auth
DB_NAME=crud_db
DB_TRUSTED_CONNECTION=true      # true = Windows Auth, false = SQL login
```

### 3. Start the server

```bash
# development (auto-reload)
npm run dev

# production
npm start
```

---

## API Endpoints

Base URL: `http://localhost:3000/api`

| Method | Endpoint      | Description       |
|--------|---------------|-------------------|
| GET    | /users        | Get all users     |
| GET    | /users/:id    | Get user by ID    |
| POST   | /users        | Create a new user |
| PUT    | /users/:id    | Update a user     |
| DELETE | /users/:id    | Delete a user     |

### Examples

#### POST /api/users
```json
// Request body
{ "name": "Alice", "email": "alice@example.com", "age": 28 }

// 201 Response
{ "success": true, "data": { "id": 1, "name": "Alice", "email": "alice@example.com", "age": 28, ... } }
```

#### PUT /api/users/1
```json
// Request body (all fields optional)
{ "age": 29 }

// 200 Response
{ "success": true, "data": { "id": 1, "name": "Alice", "email": "alice@example.com", "age": 29, ... } }
```

#### DELETE /api/users/1
```json
// 200 Response
{ "success": true, "message": "User deleted successfully" }
```
