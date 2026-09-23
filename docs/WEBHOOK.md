# Webhook Contract

## Endpoint

```
POST /webhooks/sepay
Content-Type: application/json
Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>
```

## Request body (SePay payload fields consumed)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string \| number | yes | Provider transaction id — our idempotency key. |
| `gateway` | string | yes | Bank name, e.g. `"MBBank"`. |
| `transferType` | `"in"` \| `"out"` | yes | Only `"in"` represents money received. |
| `transferAmount` | number \| string | yes | Must be > 0. |
| `transactionDate` | string | no | Bank-reported timestamp, stored as-is. |
| `accountNumber` | string | no | |
| `code` | string \| null | no | Fallback for `referenceCode`. |
| `subAccount` | string \| null | no | Fallback for `accountNumber`. |
| `content` | string | no | Transfer memo/content. |
| `description` | string | no | Fallback for `content`. |
| `referenceCode` | string \| null | no | |

Any other fields are ignored by validation but the **entire raw body** is
stored in `transactions.raw_payload` / `webhook_logs.raw_payload` for
audit and reconciliation.

## Responses

| Case | HTTP | Body |
|---|---|---|
| Valid, new transaction | 200 | `{"success": true, "transactionId": "...", "duplicate": false}` |
| Valid, already-seen transaction | 200 | `{"success": true, "transactionId": "...", "duplicate": true}` |
| Missing/invalid `Authorization` | 401 | `{"success": false, "error": "unauthorized"}` |
| Invalid payload (schema, zero/negative amount, wrong type) | 400 | `{"success": false, "error": "<reason>"}` |

SePay retries on any non-2xx response (see `docs/SEPAY.md` /
`docs/TECHNICAL_NOTES.md` for retry timing). Because idempotency is
enforced at the database layer, retries are always safe to accept with a
200 rather than an error, once the payload itself is valid.

## Normalized transaction model

Stored in `backend/src/db/schema.sql` / `backend/src/models/transaction.ts`:

```
id                 our own UUID (primary key)
provider           'sepay'
gateway            bank name, e.g. 'MBBank'
transaction_id     provider's unique id (UNIQUE constraint — idempotency key)
reference_code     nullable
account_number     nullable
amount             integer, VND, > 0
transaction_type   'in' | 'out'
content            nullable, transfer memo
transaction_date   nullable, ISO/raw string as reported by provider
received_at        ISO 8601, when OUR webhook received it
status             'received' | 'announced' | 'error'
raw_payload        full original JSON body (string)
created_at / updated_at
```

## Payment event

On a **new** (non-duplicate) valid transaction, the backend publishes:

```json
{
  "type": "PAYMENT_RECEIVED",
  "transactionId": "100001",
  "amount": 200000,
  "content": "ATIEU 1234",
  "transactionDate": "2026-09-23 13:42:10",
  "referenceCode": "FT26266123456",
  "provider": "sepay"
}
```

No secrets are ever included in this event. It is delivered to connected
desktop clients over `ws://<host>:<DESKTOP_EVENT_WS_PORT>`.

## Debugging a webhook

1. Check `GET /transactions?limit=20` for the persisted row.
2. Check the `webhook_logs` table (via `sqlite3 backend/data/*.sqlite
   "select * from webhook_logs order by received_at desc limit 20;"`) for
   every delivery attempt, including rejected ones, with the reason.
3. Check backend stdout logs (pino, structured JSON in production, pretty
   in development).
