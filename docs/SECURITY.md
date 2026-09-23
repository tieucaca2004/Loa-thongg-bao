# Security

## Secrets

- The only secret is `SEPAY_WEBHOOK_API_KEY`, read from the environment
  (`backend/src/config.ts`, via `zod`-validated `process.env`). It is never
  hard-coded, never committed (`.env` is git-ignored; only `.env.example`
  with a placeholder is committed), and never logged.
- `backend/src/lib/logger.ts` configures pino `redact` for
  `authorization` headers and any `apiKey`/`secret` field, as defense in
  depth even if a future code path accidentally logs a request object.
- `backend/src/services/sepay/auth.ts` never logs the header value or the
  configured key — only a boolean pass/fail and, on failure, the source IP.

## Webhook authentication

`Authorization: Apikey <key>` is compared with
[`crypto.timingSafeEqual`](https://nodejs.org/api/crypto.html#cryptotimingsafeequalab)
to avoid timing side-channels, rather than `===`. See
`docs/TECHNICAL_NOTES.md` for the open question of whether SePay also
offers HMAC payload signing — not implemented in V1 since it couldn't be
confirmed from reachable docs.

## Input validation & limits

- Request bodies are validated against a strict `zod` schema
  (`backend/src/services/sepay/schema.ts`) before anything is normalized
  or persisted. Malformed JSON, wrong types, missing required fields,
  zero/negative amounts, and invalid `transferType` are all rejected with
  `400` before touching the database.
- `WEBHOOK_BODY_LIMIT_BYTES` (default 1 MB) is enforced by Fastify's
  `bodyLimit` option, protecting against oversized payloads.
- The DB layer only ever executes parameterized/prepared statements
  (`better-sqlite3` `.prepare()` with named params) — no string-built SQL,
  so there is no SQL injection surface.

## Transport

- Production deployments **must** terminate HTTPS in front of the backend
  (e.g. a reverse proxy/load balancer) — the Fastify app itself listens
  plain HTTP on `HOST`/`PORT` and is expected to sit behind TLS
  termination. Document this in your deployment runbook; V1 does not
  bundle a TLS setup since that's environment-specific.
- The desktop↔backend WebSocket event stream is designed for a private
  LAN between the counter machine and the backend; if backend and desktop
  are ever on different networks, put that link behind a VPN or WSS +
  auth token (not implemented in V1 — same-network deployment assumed).

## Least exposure

- The SQLite database file lives under `backend/data/` (git-ignored) and
  is never exposed by any HTTP route directly — only through
  `GET /transactions` (read-only, normalized fields, no raw file access).
- `raw_payload` is stored for reconciliation but contains no more than
  what SePay itself sent (no secrets are ever part of that payload).

## Rate limiting (Phase 9)

`POST /webhooks/sepay` is rate-limited per source IP via
`@fastify/rate-limit`, configured only on that route (`global: false` —
`/health` and `/transactions` are unlimited). Limits are configurable via
`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` (default 60 requests/minute),
generous enough that SePay's documented worst-case retry burst (up to 8
delivery attempts for one transaction, see `docs/TECHNICAL_NOTES.md`) is
never blocked — see `backend/src/__tests__/hardening.test.ts` for the
proof (a simulated 8-attempt retry burst all return 200; a synthetic flood
beyond the configured max gets `429`).

Implementation note: the plugin must be registered before the route is
declared, and the route declaration must be wrapped in `app.after()` so it
runs once the (asynchronously booting) rate-limit plugin has actually
attached its `onRoute` hook — otherwise the per-route `config.rateLimit`
silently never takes effect. See the comment in `backend/src/app.ts`.

## Structured error handling (Phase 9)

A centralized Fastify error handler (`app.setErrorHandler`) ensures:
- Malformed JSON / unsupported content-type / oversized bodies return a
  controlled `400` (never a stack trace), and are recorded in
  `webhook_logs` as `rejected_invalid` for reconciliation.
- Any unexpected internal error (e.g. the database becomes unavailable)
  returns a controlled `500 {"success": false, ...}` — never a false
  `200 success`. The full error is logged server-side only.
- `PaymentEventBus.publish()` isolates each subscriber: if the WebSocket
  broadcast loop (or any other subscriber) throws, it cannot propagate
  back into the webhook handler and turn an already-persisted transaction
  into a false failure response, and it cannot block other subscribers
  from receiving the event. See
  `backend/src/__tests__/eventBusResilience.test.ts`.

## Testing security-relevant behavior

`backend/src/__tests__/hardening.test.ts` and `logRedaction.test.ts` cover:
malformed JSON handling, unsupported content-type, method validation (404
for undefined route+method combos), a simulated DB failure returning a
controlled 5xx instead of false success, rate-limit enforcement (blocks
once over the configured max) and non-interference with legitimate retry
bursts, and that Authorization headers / apiKey / secret-shaped fields are
never present in log output.

## Database safety (Phase 9 review)

- **WAL mode** is enabled (`backend/src/db/index.ts`, `db.pragma('journal_mode = WAL')`) — appropriate here since the backend is a single process with potentially concurrent readers (`GET /transactions`, `GET /health`) and one writer stream (the webhook route); WAL avoids writer-blocks-reader contention.
- **Foreign keys** are enabled (`db.pragma('foreign_keys = ON')`) — no foreign-key relationships exist yet in the V1 schema, but this is on by default for when they're added.
- **Transaction integrity**: every insert is a single `better-sqlite3` prepared statement (`INSERT OR IGNORE`), which SQLite executes atomically — no multi-statement transaction is needed for this write shape, and none was added just for its own sake, per project rule not to overengineer.
- **`transaction_id` UNIQUE constraint** is the idempotency guarantee (see `docs/ARCHITECTURE.md`); confirmed unchanged in this phase — no schema migration was needed or made.
- **Safe concurrent access**: `better-sqlite3` is synchronous and single-connection; combined with WAL mode this is safe for one backend process. Running multiple backend processes against the same SQLite file is **not supported** in V1 (would need a real DB server) — call this out explicitly if you ever scale beyond one instance.
- **Graceful shutdown**: `backend/src/server.ts` closes the Fastify server and the SQLite handle on `SIGINT`/`SIGTERM` before exiting, so no write is left mid-flight.
- **Database file location**: `backend/data/` (configurable via `DATABASE_PATH`), git-ignored, not served by any HTTP route.
- **Backup strategy (recommendation, not yet automated)**: because WAL mode keeps uncommitted data in a separate `-wal` file, a plain file copy of the `.sqlite` file alone can miss recent writes. Use SQLite's own [online backup](https://www.sqlite.org/backup.html) (`sqlite3 payment-engine.sqlite ".backup backup.sqlite"`), which safely includes WAL contents, on a periodic cron/schedule, and store backups outside the container. This is an operational/deployment concern rather than application code, so V1 documents it here rather than shipping an unrequested backup script — added if/when a real deployment target is chosen (Phase 10).

## What to do if the API key leaks

1. Generate a new random key, update `SEPAY_WEBHOOK_API_KEY` in the
   backend's environment, and redeploy.
2. Update the webhook's configured API key in the SePay dashboard to
   match.
3. Review `webhook_logs` for any `rejected_auth` entries around the
   suspected leak window as a sanity check.
