# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Setup
- Install dependencies: `npm install` (run in the repository root).
- Copy `.env.example` to `.env` and fill in required values (at minimum `DATABASE_URL`; optionally override `PORT`, `NODE_ENV`, `LOG_LEVEL`, and `JWT_SECRET`).

### Development server
- Start the API in watch mode: `npm run dev`
  - Loads environment variables via `dotenv` and starts the Express server defined in `src/server.js` / `src/app.js`.
  - Listens on `PORT` from the environment, defaulting to `3000`.

### Linting and formatting
- Lint the codebase: `npm run lint`
- Auto-fix lint issues where possible: `npm run lint:fix`
- Format the codebase with Prettier: `npm run format`
- Check formatting without writing changes: `npm run format:check`

### Database (Drizzle ORM + Neon/Postgres)
- Generate Drizzle SQL/migration artifacts from the model definitions in `src/models/*.js`:
  - `npm run db:generate`
- Run pending migrations against the database specified by `DATABASE_URL`:
  - `npm run db:migrate`
- Open Drizzle Studio (database browser/inspector):
  - `npm run db:studio`

`drizzle.config.js` controls the schema and output locations; generated SQL and metadata live under the `drizzle/` directory.

### Tests
- There is currently no test script configured in `package.json` and no `tests/` directory in this repo. When a test runner is added, update this section with how to run the full suite and a single test file.

## Architecture overview

This is a Node.js REST API built with Express, Drizzle ORM, and Neon. The codebase is organized into clear layers around configuration, models, services, controllers, routes, validations, and shared utilities.

### Entry points and server lifecycle
- `src/index.js`
  - Loads environment variables via `dotenv/config`.
  - Imports `./server.js` for side effects; this starts the HTTP server.
- `src/server.js`
  - Imports the configured Express app from `./app.js`.
  - Reads `PORT` from the environment (default `3000`).
  - Calls `app.listen(PORT, ...)` and logs a simple startup message.
- `src/app.js`
  - Constructs and configures the shared Express `app` instance used by the server.
  - Attaches middleware and routes (see next section) and exports `app`.

### Express app composition
`src/app.js` wires common cross-cutting concerns and high-level HTTP routes:
- Security and transport middleware
  - `helmet()` for basic HTTP security headers.
  - `cors()` with open configuration for now (all origins allowed).
  - `express.json()` and `express.urlencoded({ extended: true })` for body parsing.
  - `cookie-parser` to populate `req.cookies`.
- Logging
  - Uses `morgan('combined')` with a custom stream that writes into the shared Winston logger from `#config/logger.js`.
- Core endpoints
  - `GET /` – basic health-style landing endpoint; logs and returns a simple text message.
  - `GET /health` – health check returning JSON with `status`, `timestamp`, and `uptime`.
  - `GET /api` – simple JSON indicating the API is running.
  - Auth routes mounted at `app.use('/api/auth', authRoutes)`; see "Authentication flow" below.

### Module aliases

This project uses Node.js `imports` (in `package.json`) to provide alias-based import paths:
- `#config/*` → `./src/config/*`
- `#controllers/*` → `./src/controllers/*`
- `#models/*` → `./src/models/*`
- `#routes/*` → `./src/routes/*`
- `#utils/*` → `./src/utils/*`
- `#middleware/*` → `./src/middleware/*`
- `#services/*` → `./src/services/*`
- `#validations/*` → `./src/validations/*`

Prefer these aliases instead of relative paths when working inside `src/`.

### Configuration layer (`src/config`)
- `src/config/database.js`
  - Uses `@neondatabase/serverless` to create a `sql` client from `process.env.DATABASE_URL`.
  - Wraps the Neon client with `drizzle-orm/neon-http` and exports both `db` and `sql`.
  - `db` is the primary way services interact with Postgres.
- `src/config/logger.js`
  - Defines a shared Winston logger instance.
  - Log level comes from `LOG_LEVEL` (default `info`).
  - Writes to `logs/error.log` (level `error` and above) and `logs/combined.log` (level `info` and above).
  - In non-production (`NODE_ENV !== 'production'`), also logs to the console with colored, simple formatting.

### Data layer and Drizzle models (`src/models` + `drizzle/`)
- `src/models/user.model.js`
  - Defines the `users` table using Drizzle's `pgTable` and column helpers.
  - Columns: `id`, `name`, `email` (unique), `password`, `role` (default `user`), and `created_at` / `updated_at` timestamps.
- `drizzle.config.js`
  - Points Drizzle at `./src/models/*.js` for schema definitions.
  - Writes migrations/SQL to the `./drizzle` directory.
- `drizzle/`
  - Contains SQL migration(s) and Drizzle metadata (`_journal.json`, snapshots, etc.)
  - Managed via the `db:*` npm scripts.

### Services and business logic (`src/services`)

Services encapsulate business logic and database access. Controllers should call services instead of talking to the database directly.

- `src/services/auth.service.js`
  - Depends on `#config/logger.js`, `#config/database.js`, `#models/user.model.js`, `bcrypt`, and `drizzle-orm`.
  - `hashPassword(password)` – hashes passwords with bcrypt.
  - `comparePassword(password, hashedPassword)` – compares plaintext vs stored hash.
  - `createUser({ name, email, password, role })`
    - Checks for an existing user with the same email using Drizzle and `eq(users.email, email)`.
    - Hashes the password and inserts a new row into `users`.
    - Returns a projection of the new user (no password field) and logs success.
  - `authenticateUser({ email, password })`
    - Fetches a user by email; throws if not found.
    - Uses `comparePassword` to check the password; throws on mismatch.
    - Returns a projection without the password and logs success.

### Controllers and request orchestration (`src/controllers`)

Controllers sit between Express routes and services, handling validation, error shaping, and HTTP concerns.

- `src/controllers/auth.controller.js`
  - Imports validation schemas from `#validations/auth.validation.js` and helpers from `#utils`.
  - `signup(req, res, next)`
    - Validates the request body with `signupSchema.safeParse`.
    - On validation failure, responds with HTTP 400 and a formatted error string.
    - On success, calls `createUser` and then issues a JWT token via `jwttoken.sign`.
    - Sets the token in an HTTP-only cookie using `cookies.set` and returns a 201 response with user data.
    - Handles the "user already exists" case with HTTP 409.
  - `signIn(req, res, next)`
    - Validates the request body with `signInSchema.safeParse`.
    - On success, calls `authenticateUser`, issues a JWT, and sets the cookie.
    - Returns a 200 response with user metadata; maps "User not found" or "Invalid password" to HTTP 401.
  - `signOut(req, res, next)`
    - Clears the auth cookie using `cookies.clear` and returns a 200 confirmation response.

Controllers consistently:
- Use Zod validation schemas for input safety.
- Use the shared `formatValidationError` helper for human-readable validation errors.
- Log key events via the central logger.
- Map domain/service errors into HTTP status codes and payloads.

### Routes (`src/routes`)

Routes map HTTP paths and methods to controllers.

- `src/routes/auth.routes.js`
  - Creates an Express `Router`.
  - Defines:
    - `POST /api/auth/sign-up` → `signup`
    - `POST /api/auth/sign-in` → `signIn`
    - `POST /api/auth/sign-out` → `signOut`
  - The router is mounted under `/api/auth` in `src/app.js`.

The pattern for new feature areas is to add route modules under `src/routes`, controller modules under `src/controllers`, and optionally service modules under `src/services`, following the existing auth flow as a reference.

### Validations (`src/validations`)

Validation schemas are defined with Zod and used in controllers.

- `src/validations/auth.validation.js`
  - `signupSchema`
    - Validates `name`, `email`, `password`, and `role` for sign-up.
    - Enforces string lengths and formats; restricts `role` to `user` or `admin`.
  - `signInSchema`
    - Validates `email` and `password` for sign-in.

### Utilities (`src/utils`)

Small, reusable utilities that support controllers and services.

- `src/utils/jwt.js`
  - Wraps `jsonwebtoken` with a `jwttoken` helper that exposes:
    - `sign(payload)` – signs a token with `JWT_SECRET` (defaulting to a development placeholder) and an expiry of `1d`.
    - `verify(token)` – verifies a token and throws a generic error on failure.
  - Logs failures with the shared logger.
- `src/utils/cookies.js`
  - Centralizes cookie behavior and flags:
    - `getOptions()` – base cookie options (`httpOnly`, `secure` in production, `sameSite: 'strict'`, 15-minute `maxAge`).
    - `set(res, name, value, options)` – sets a cookie merging default and custom options.
    - `clear(res, name, options)` – clears a cookie with the same option set.
    - `get(req, name)` – fetches a cookie by name from `req.cookies`.
- `src/utils/format.js`
  - `formatValidationError(errors)` – converts Zod error objects into a comma-separated string of messages or a generic message.

### Middleware (`src/middleware`)

`src/middleware` exists for shared Express middleware but is currently empty. When implementing authentication/authorization, rate limiting, or other cross-cutting concerns, prefer placing them here and wiring them into `src/app.js` or specific routers.

## Linting and style

- ESLint is configured via `eslint.config.js` using `@eslint/js`'s recommended rules, with additional style rules (2-space indentation, single quotes, semicolons, no `var`, prefer `const`, etc.).
- ESLint ignores `node_modules`, `coverage`, `logs`, and `drizzle`.
- Test files under `tests/**/*.js` are given Jest-style globals in the ESLint config, but such files do not yet exist in this repository.
- Prettier is configured via `.prettierrc` and is expected to be used together with ESLint (see the `format*` and `lint*` scripts).