# Backend Architecture (Technical View)

## 1. System Context

The current backend is a monolithic Node.js/Express application initialized in `server.js`, where all HTTP endpoints are wired together.

**Core building blocks:**

- **Node.js/Express API (`server.js`)**
  - Starts the HTTP server.
  - Registers global middleware.
  - Injects a Supabase client into all route modules.
- **Supabase (DB + Storage)**
  - Primary data access layer for domain objects (e.g., `users`, `tasks`, `notifications`, `documents`).
  - File storage via the Supabase Storage bucket `documents`.
- **Matterport GraphQL API (`app/resolvers/matterPortResolver.js`)**
  - External integration via GraphQL requests to `https://api.matterport.com/api/models/graph`.
  - Uses API key/secret from environment variables.

---

## 2. Runtime Composition

### Middleware Pipeline

Based on `server.js`, the middleware order is:

1. `express.json()`
2. `cors(...)` (currently `origin: '*'`)
3. `bodyParser.json({ limit: '100mb' })`
4. `bodyParser.urlencoded({ limit: '100mb', extended: true })`
5. `cookieParser(COOKIE_SECRET)`
6. Swagger UI mounted at `/api-docs`

### Route Registration from `server.js`

The server registers route modules with a shared `supabase` client:

- `userRoutes`
- `spaceRoutes`
- `taskRoutes`
- `matterPortRoutes`
- `menuRoutes`
- `documentRoutes`
- `listRoutes`
- `notificationRoutes`
- `floorsRoutes`
- `assetRoutes`
- `eventRoutes`
- `spaceMembershipRoutes`

The application is therefore structured as a single Express process with modular route registration.

---

## 3. Data Access

### Supabase Client Creation

There are two access patterns:

1. **Global service client in `server.js`**
   - `createClient(SUPABASE_URL, SUPABASE_KEY)`
   - Passed to all route registration functions.
2. **Helper in `app/db.js` (`getSupabaseSettings`)**
   - Optional token-based client with `Authorization: Bearer <token>` header.
   - Falls back to a service client when no token is provided.

### Storage Upload/Signing in the Document Flow (`app/routes/documentRoute.js`)

The document flow combines local filesystem operations + Supabase Storage + relational metadata persistence:

- Upload via `multer` to temporary `uploads/`.
- Read file via `fs.readFileSync(...)`.
- Upload to Storage bucket `documents` at `documents/<originalname>`.
- Persist metadata in `documents` table (`storage_path`, `mime_type`, references).
- Provide downloads using `createSignedUrl(..., 60 * 60)`.
- On update/delete: remove old storage files, then update database records.

Note: With `upsert: true` and original filename as key, uploads with identical names can overwrite existing files.

---

## 4. Authentication / Authorization

### JWT Flow (`app/utils.js`)

- `updateJwtToken(userId)` creates:
  - `refreshToken` (7 days)
  - `accessToken` (30 minutes)
- `updateAccessToken(refreshToken)` validates refresh token and issues a new access token.
- `tokenValidator('jwt')`:
  - Reads the `Authorization` header.
  - Validates JWT via `checkJwtToken`.
  - Writes `req.user_id` on success.

### Basic Auth for API Token (`/get-api-token`)

In `app/routes/userRoute.js`:

- Endpoint `/get-api-token` expects `Authorization: Basic ...`.
- Validates against `API_LOGIN` / `API_PASS` from environment variables.
- Returns `apiToken` using `generateApiToken()`.

### Inconsistency Note (`System.findOne(...)`)

In `app/utils.js`, `checkApiToken()` and `generateApiToken()` reference `System.findOne(...)`, but no `System` model is imported in this Node/Supabase setup.

- This appears to be leftover logic from an older ORM architecture.
- Risk: runtime failures on API token validation/generation code paths.

---

## 5. Integrations

### Matterport Synchronization

- Trigger endpoint: `GET /synhronize-model` in `app/routes/matterPortRoute.js`.
- Core logic: `synhronizeModels(supabase)` in `app/resolvers/matterPortResolver.js`.

### Mapping Mattertags to `locations`, `floors`, `rooms`

`getModelInfo()` retrieves mattertags + floors from the Matterport model. The sync process:

1. Ensures fallback records `Unknown Floor` / `Unknown Room` exist.
2. Reads `label`, `description`, `position`, `color` for each mattertag.
3. Extracts from `description` using regex:
   - `Floor: ...`
   - `Room: ...`
4. Creates/updates `floors` and `rooms` when needed.
5. Applies upsert-like behavior for `locations` (update on match, insert otherwise).

This makes Matterport an external source context for spatial entities in the Supabase data model.

---

## 6. API Documentation

- Swagger UI is exposed at `/api-docs` (`swagger-ui-express`).
- Specification is loaded from root-level `swagger.json`.

The API documentation is statically mounted (no runtime-generated OpenAPI).

---

## 7. Known Technical Debt / Deviations

1. **Typos / Naming**
   - `synhronize` (instead of `synchronize`) in resolver/route names and endpoint path.
   - `reccuring` (instead of `recurring`) in type definitions (`app/types/database.types.ts`).

2. **Error-prone field/name usage**
   - In `matterPortRoute.js`, delete logic uses `location.matterport_id` even though `matterport_tag_id` is selected.
   - In `synhronizeModels`, location existence is checked via `.eq('location_id', matterport_tag_id)` while a separate `matterport_tag_id` field exists.

3. **Security notes (open endpoints without `tokenValidator`)**
   - Several write endpoints are currently reachable without JWT/API-token protection (e.g., parts of `notifications`, `locations`, `document` update).
   - CORS is globally open (`origin: '*'`).

4. **Robustness / Error handling**
   - Partially inconsistent error paths and status codes (`404` for token failures instead of `401/403`).
   - Some references (e.g., `res.json({ tag })`) use variables not defined in scope.

These points should be prioritized into a technical backlog based on operational risk (security/runtime failures before naming cleanups).
