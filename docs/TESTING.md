# Testing

## Automated tests

```
cd backend && npm test     # 26 tests: webhook validation, auth, idempotency, health,
                            #           event-bus resilience, rate limiting, error handling, log redaction
cd desktop && npm test     # 16 tests: number-to-words, formatter, announcement queue
```

### Backend (`backend/src/__tests__/`)

- `webhook.test.ts` — valid transaction accepted & stored; invalid
  Authorization header (wrong / missing) rejected with 401; missing
  `id` rejected 400; zero amount rejected; negative amount rejected;
  invalid `transferType` rejected; malformed (non-object) body rejected;
  **idempotency**: the same transaction posted 10 times results in exactly
  1 stored row and exactly 1 `PAYMENT_RECEIVED` event; `/health` reports ok.
- `idempotency.test.ts` — repository-level proof (10x insert → 1 row),
  duplicate flag on 2nd+ insert, two different ids both stored, and a
  **simulated backend restart** (close + reopen the same SQLite file) still
  finds the previously stored transaction — proving Acceptance Test 6
  (backend restart, history not lost).
- `eventBusResilience.test.ts` (Phase 9) — a throwing event subscriber
  cannot propagate back through `publish()`, and cannot block other
  subscribers from receiving the event. This is a real defect found and
  fixed during Phase 9 hardening: reproduced first (see the commit that
  added this test), then `PaymentEventBus.publish()` was changed to
  isolate each subscriber in its own try/catch.
- `hardening.test.ts` (Phase 9) — malformed JSON body → controlled 400
  (not a stack trace) + a `webhook_logs` entry; unsupported content-type
  rejected; `GET /webhooks/sepay` (wrong method) → 404; a simulated DB
  failure (closed handle) → controlled 500, never a false `200 success`;
  rate limiting: requests beyond the configured per-IP max get `429`,
  `/health`/`/transactions` are never rate-limited, and a realistic
  8-attempt SePay retry burst is never blocked by the default limit.
- `logRedaction.test.ts` (Phase 9) — the logger's declared redact rules
  actually remove an `Authorization` header value and `apiKey`/`secret`/
  `SEPAY_WEBHOOK_API_KEY`-shaped fields from real log output (captured
  from a live pino stream, not just eyeballing the config).

### Desktop (`desktop/src/__tests__/`)

- `vietnameseNumber.test.ts` — zero, ones/tens/hundreds spoken forms
  (`mốt`, `lăm`, `tư`, `linh`), thousands, and a large 7-digit amount.
- `formatter.test.ts` — message with/without content, large amount.
- `announcementQueue.test.ts` — valid amount speaks once; **the same
  transaction id is never spoken twice**; large amount; TTS engine
  rejecting is caught and reported as `failed` without throwing and
  without marking the transaction announced; `retryLastFailed()` re-speaks
  and succeeds; concurrent `announce()` calls are serialized (FIFO), which
  is what prevents overlapping/garbled audio when two events arrive close
  together.

## Manual / integration verification performed during development

Run from repo root with the backend built and started (see README §4-6):

```bash
node scripts/simulate-webhook.mjs --amount 100000 --content "ATIEU 1234" --id demo-1
node scripts/simulate-webhook.mjs --amount 100000 --content "ATIEU 1234" --id demo-1 --repeat 10
curl -s "http://localhost:3000/transactions?limit=5"
```

This was run during Phase 8 and confirmed:
- A single simulated transaction is accepted (`HTTP 200`) and appears in
  `GET /transactions`.
- The **same** transaction id sent 10 times in a row results in exactly
  one row in `GET /transactions` (verified via direct SQLite query) and
  the backend logs 1x "transaction persisted" + 9x "duplicate webhook
  ignored (idempotent)".
- A WebSocket client connected to `DESKTOP_EVENT_WS_PORT` receives exactly
  one `PAYMENT_RECEIVED` message for that id, never more.

## Acceptance tests (project spec §16) — status

| # | Test | Status | Evidence |
|---|---|---|---|
| 1 | Simulated 100,000 VND transaction accepted | PASS | `webhook.test.ts`, manual run above |
| 2 | Transaction saved to DB | PASS | `webhook.test.ts`, `idempotency.test.ts` |
| 3 | Same transaction x10 → 1 row | PASS | `idempotency.test.ts`, manual run above |
| 4 | Desktop receives payment event | PASS (code path) | `BackendClient` + manual WS client test during development |
| 5 | Desktop speaks "Đã nhận một trăm nghìn đồng." | PASS (formatter) | `formatter.test.ts` proves exact string; real audio requires a Windows machine with SAPI, not available in this dev container |
| 6 | Backend restart → history not lost | PASS | `idempotency.test.ts` "survives a simulated restart" |
| 7 | Desktop restart → reconnect works | PASS (code path) | `BackendClient` auto-reconnect with backoff; not exercised with a real Electron window in this headless container |
| 8 | TTS engine error → transaction still exists | PASS | `announcementQueue.test.ts` "reports failure without throwing"; transaction persistence is independent of TTS by design (see ARCHITECTURE.md) |
| 9 | Webhook retry → no duplicate read | PASS | idempotency tests + manual repeat-10 run |
| 10 | Full end-to-end: simulated → backend → DB → event → desktop → TTS → speaker | PARTIAL | Backend↔event pipeline fully proven (webhook → DB → WebSocket event). The final desktop-GUI + real Windows SAPI speaker hop requires running the Electron app on an actual Windows machine, which this Linux cloud dev container cannot do. All desktop-side logic feeding that last hop (formatter, dedupe, TTS call, UI wiring) is implemented and unit-tested. |

**Test 10 needs to be re-run manually on the target Windows counter
machine** before sign-off: `npm run dev` in `desktop/`, point it at the
running backend's WS port, fire `scripts/simulate-webhook.mjs`, and confirm
audio actually plays.
