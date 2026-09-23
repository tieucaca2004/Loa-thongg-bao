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
- Rate limiting: not yet implemented in V1 (the primary defense is API-key
  auth + strict schema validation). Recommended before production:
  `@fastify/rate-limit` on `/webhooks/sepay`, scoped by source IP.

## What to do if the API key leaks

1. Generate a new random key, update `SEPAY_WEBHOOK_API_KEY` in the
   backend's environment, and redeploy.
2. Update the webhook's configured API key in the SePay dashboard to
   match.
3. Review `webhook_logs` for any `rejected_auth` entries around the
   suspected leak window as a sanity check.
