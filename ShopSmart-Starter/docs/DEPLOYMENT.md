# ShopSmart deployment plan

Status: **local release candidate only.** Live staging has not been deployed. Use this plan only when the instructor approves a hosting platform and a database. Check every hosting command against that platform's current documentation before use.

## Architecture

```text
                       (internet, HTTPS)                      (internet, HTTPS)
 Browser  ───────────────────────────►  Static frontend host
   │                                     Vite build: frontend/dist
   │                                     Build-time config: VITE_API_URL (public)
   │
   │  fetch https://<api-host>/api/...  (internet, HTTPS, CORS-checked)
   └───────────────────────────────────►  Express API server (Node 22)
                                           Runtime secrets: DATABASE_URL, GEMINI_API_KEY
                                           Runtime config: PORT, NODE_ENV, FRONTEND_URL,
                                                           GEMINI_MODEL, AI_TIMEOUT_MS
                                                │                       │
                         private network or TLS │                       │ internet, HTTPS
                         (never public)         ▼                       ▼ (only if a key is set)
                                      PostgreSQL 16 (managed)      Gemini API (optional)
```

The browser talks to two public services: the static site and the API. Only the API talks to PostgreSQL and the AI provider. The database is never called from the browser.

## Service plan

| Question | Plan |
| --- | --- |
| Where are the Vite build files hosted? | Any approved static host. Build command: `npm ci && npm run build --workspace frontend`. Publish directory: `frontend/dist`. Configure a single-page-app rewrite so `/cart`, `/checkout` and `/assistant` serve `index.html`. |
| Which URL does the frontend use for the API? | `VITE_API_URL=https://<api-host>/api`, set in the static host's build settings. This value is public by design; Vite copies every `VITE_` variable into the browser bundle. |
| Where does Express run and what serves `/api/health`? | An approved Node 22 web service. Build: `npm ci && npm run db:generate`. Start: `npm run db:deploy && npm start --workspace backend`. Health URL: `https://<api-host>/api/health` returns `{"status":"ok"}`. |
| Where does PostgreSQL run and how does the server get `DATABASE_URL`? | A managed PostgreSQL 16 instance on the same platform or region. `DATABASE_URL` is entered in the API service's secret/environment settings, never in a file in the repository. Prefer the platform's internal connection string; otherwise require `sslmode=require`. |
| Which origin does `FRONTEND_URL` allow? | Exactly the static site origin, e.g. `https://<frontend-host>` (scheme + host, no path, no trailing slash). `app.js` passes it to `cors()`, so other origins are refused. |
| Where is a provider key stored? | Only in the API service's secret settings as `GEMINI_API_KEY`. It is read by `backend/src/services/assistant.js` on the server. It must never be put in `frontend/.env`, a `VITE_` variable, a screenshot or a commit. Without a key the assistant uses catalog rules. |
| How are migrations applied without wiping orders? | `npm run db:deploy` runs `prisma migrate deploy`, which only applies committed migrations from `backend/prisma/migrations` and never resets data. Do **not** use `npm run db:migrate` (that is `prisma migrate dev`, local only) or `prisma migrate reset` on staging. Seed the empty staging database once with `npm run db:seed`; it refuses to run if orders exist. |
| Who can access staging, and with what data? | Only the team and instructor. Use the platform's password protection or a private URL that is not posted publicly. Only fictional customers such as "Ana Reyes, ana@example.com" are entered. There is no authentication, so the order endpoint must not be advertised to the public. |

## Configuration list

| Variable | Service | Secret? | Example |
| --- | --- | --- | --- |
| `VITE_API_URL` | Static frontend (build time) | No, public | `https://<api-host>/api` |
| `DATABASE_URL` | API | **Yes** | provided by the database host |
| `FRONTEND_URL` | API | No | `https://<frontend-host>` |
| `PORT` | API | No | usually set by the host |
| `NODE_ENV` | API | No | `production` |
| `GEMINI_API_KEY` | API (optional) | **Yes** | provider console |
| `GEMINI_MODEL` | API (optional) | No | check the provider's current model list |
| `AI_TIMEOUT_MS` | API (optional) | No | `8000` |

Platform notes:

- `prisma` is a backend devDependency. If the host removes devDependencies before the start command, run migrations in the build step instead (`npm ci && npm run db:generate && npm run db:deploy`).
- `npm ci` on the Linux host generates a Linux Prisma engine. Do not upload a `node_modules` folder from Windows; its Prisma, esbuild and Rollup binaries only work on Windows.

## Verification after each deploy

Run against the real URLs and record the date, URLs and result (without credentials):

```bash
node backend/scripts/smoke.js https://<api-host>/api https://<frontend-host>
```

Then in the browser: products load, search for `keyboard`, add to cart, change quantity, place one simulated order with fictional details, ask the assistant `Which keyboard is below ₱2,000?`.

Before submitting, confirm the frontend bundle has no secrets:

```bash
npm run build
grep -rEl "DATABASE_URL|GEMINI|postgresql://" frontend/dist && echo "SECRET FOUND" || echo "bundle clean"
```
