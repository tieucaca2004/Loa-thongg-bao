# Architecture — A Tieu Payment Engine V1

## Goal

```
MBBank → SePay → Webhook → Payment Engine (backend) → Desktop App → TTS → Loa máy tính
```

V1 proves this pipeline end-to-end using SePay **Test Mode / simulated
transactions** — no real MBBank connection is used yet (see project rule
"Test Mode trước" and `docs/SEPAY.md`).

## Two independent processes

```
┌─────────────────┐        HTTP POST         ┌───────────────────────────┐
│  SePay (or the  │ ───────────────────────▶ │   Backend (Payment Engine) │
│  simulate-webhook│      /webhooks/sepay      │   Fastify + SQLite         │
│  test script)    │ ◀─────────────────────── │   - validate               │
└─────────────────┘   200 {success:true}      │   - normalize               │
                                               │   - idempotency check       │
                                               │   - persist transaction     │
                                               │   - publish PAYMENT_RECEIVED│
                                               └──────────┬──────────────────┘
                                                           │ WebSocket
                                                           │ (ws://.../events)
                                                ┌──────────▼──────────────────┐
                                                │  Desktop App (Windows)       │
                                                │  Electron                    │
                                                │  - connection status         │
                                                │  - transaction history       │
                                                │  - AnnouncementQueue         │
                                                │    (dedupe by transactionId) │
                                                │  - PaymentNotificationFmt.   │
                                                │  - TTS (Windows SAPI)        │
                                                └──────────┬──────────────────┘
                                                           │
                                                       🔊 Loa máy tính
```

**Backend and Desktop App are fully separate processes/repos-in-one-repo**
(project rule: "Backend và Desktop App phải tách biệt"). They only talk
over the network (HTTP webhook in, WebSocket event out). Killing the
desktop app does not affect the backend's ability to receive and persist
transactions; killing the backend just means the desktop app shows
"disconnected" and reconnects automatically once it's back.

## Backend pipeline (single webhook request)

```
POST /webhooks/sepay
  → verify Authorization: Apikey header (constant-time compare)
  → zod-validate JSON body shape (sepayWebhookSchema)
  → normalizeSepayPayload() → NormalizedTransaction
  → TransactionRepository.insertIfNew()   [UNIQUE constraint on transaction_id]
      duplicate?  → log it, return 200 {success:true, duplicate:true}, NO event
      new?        → log it, return 200 {success:true, duplicate:false}
  → PaymentEventBus.publish(PAYMENT_RECEIVED)   [in-process, fire-and-forget]
```

Key property: **the webhook handler never calls TTS or waits on the
desktop app.** It only touches the database and an in-process
`EventEmitter`-based bus. This satisfies:

- "Webhook handler phải nhanh và không phụ thuộc desktop app."
- "Nếu TTS/desktop app chết thì giao dịch vẫn phải được lưu."
- "Không để lỗi TTS làm mất giao dịch."

A separate `WebSocketServer` (started alongside the HTTP server, different
port) subscribes to the same event bus and fan-outs `PAYMENT_RECEIVED` to
any connected desktop clients. If no desktop is connected, the event is
simply dropped for that moment — the transaction row is already safely
persisted and visible in `GET /transactions` for reconciliation, so no data
is lost, only a live notification.

## MBBank adapter (Phase 10.2)

```
MBBank / SePay
  ↓ (HTTP POST webhook)
SePayMBBankAdapter          (backend/src/services/sepay/SePayMBBankAdapter.ts)
  - verifyWebhookAuth()     — Authorization: Apikey header check
  - parseWebhook()          — validate + map SePay field names → NormalizedTransaction
  ↓
NormalizedTransaction       (backend/src/models/transaction.ts)
  ↓
Payment Engine              (processSepayWebhook: idempotency, persist)
  ↓
PAYMENT_RECEIVED event
  ↓
Desktop
```

`SePayMBBankAdapter` is the single boundary the rest of the Payment Engine
depends on for this integration — `processSepayWebhook` and the HTTP route
never see SePay's raw field names (`transferAmount`, `transferType`, `id`,
...), only the adapter's `NewTransaction` output. This was already
structurally true via `schema.ts`/`normalize.ts`/`auth.ts` since Phase 3;
Phase 10 packaged them behind one named class so the boundary is explicit
and so a second provider/bank could be added later as its own adapter
without touching `processSepayWebhook`. No behavior changed — this is a
pure refactor, verified by the unchanged Phase 1-9 test suite plus a new
`sePayMBBankAdapter.test.ts`.

**Transaction retrieval**: not implemented, and not needed — SePay's
bank-webhook product is push-only (SePay calls us), so there is no
"pull the transaction list" method on the adapter. See
`docs/TECHNICAL_NOTES.md` for the separate, unrelated SePay "Payment
Gateway" product (VietQR/cards, Basic Auth) that V1 does not integrate.

## Idempotency

`transactions.transaction_id` has a SQL `UNIQUE` constraint. Inserts use
`INSERT OR IGNORE`, so N identical webhook deliveries (SePay's own retry
policy sends up to 8 attempts) can only ever produce one row. The webhook
route still returns `200 {success:true}` on a duplicate (so SePay does not
keep retrying), but does not re-publish a `PAYMENT_RECEIVED` event, so the
desktop can never double-announce.

See `docs/WEBHOOK.md` for the full request/response contract and
`backend/src/__tests__/idempotency.test.ts` / `webhook.test.ts` for the
proof (10x identical delivery → 1 row, 1 event).

## Desktop app announcement safety

Even if a duplicate event somehow reached the desktop (e.g. two backend
instances, a manual replay), `AnnouncementQueue` keeps its own
`Set<transactionId>` of already-spoken ids and refuses to speak the same
one twice, independent of the backend's guarantee. TTS failures are caught
per-announcement and never throw past the queue — the transaction stays in
history with an "error" indicator and a manual "retry" action.

## Data model

See `docs/WEBHOOK.md` for the normalized `Transaction` model fields.

## Order integration (deliberately out of scope for V1)

`backend/src/services/payments/orderPaymentResolver.ts` defines the
`OrderPaymentResolver` interface for a future phase to implement
(`Payment Engine → Order API → xác định đơn → đánh dấu PAID`). V1 ships a
`NullOrderPaymentResolver` that is never wired into the webhook pipeline —
Payment Engine V1 has zero dependency on Order A Tieu, per project rule #10.

## Observability

- `GET /health` — process + DB liveness.
- `webhook_logs` table — every webhook delivery attempt (accepted,
  duplicate, rejected_invalid, rejected_auth), independent of whether a
  transaction row was created. This is the reconciliation/debug trail.
- Structured JSON logs (pino) for both processes; secrets are redacted
  (see `docs/SECURITY.md`).
- Desktop UI shows live connection status, last error, and per-transaction
  announced/not-announced state.
