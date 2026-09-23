# SePay Integration Notes

**Status: research done via web search only** — this development
container's egress proxy blocks `developer.sepay.vn` and `docs.sepay.vn`
directly, so the full official pages could not be fetched verbatim. See
`docs/TECHNICAL_NOTES.md` for exactly what is confirmed vs. unverified, and
for what to double-check once the docs are reachable from a normal
network.

## What V1 uses

- **Test Mode / sandbox**: SePay's dashboard (`my.sepay.vn`) has a "Test
  mode" toggle that isolates simulated bank accounts, webhooks, and
  transactions from live data. In this mode you can trigger a simulated
  incoming transaction from the UI, which SePay then delivers to your
  configured webhook URL with the same payload shape it would use for a
  real MBBank transaction.
- A separate full sandbox exists at `my.dev.sepay.vn` (requires SePay to
  activate your account after registration) for a more complete dev
  environment.

Until this container (or a developer's machine) has real network access to
`my.sepay.vn`, V1's "simulated MBBank transaction" is produced with the
included local script (`scripts/simulate-webhook.sh` /
`scripts/simulate-webhook.mjs`), which POSTs a payload in the documented
shape directly to the backend — functionally equivalent to what SePay's
Test Mode would deliver, and used to prove the pipeline (see
`docs/TESTING.md`, Acceptance Tests). **Before connecting to the real SePay
Test Mode dashboard**, re-verify the payload/field names in
`backend/src/services/sepay/schema.ts` against the live docs.

## Webhook contract (as currently implemented)

- `POST` to `/webhooks/sepay` with header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`.
- JSON body fields consumed: `id`, `gateway`, `transactionDate`,
  `accountNumber`, `code`, `content`, `transferType` (`in`|`out`),
  `transferAmount`, `referenceCode`, `subAccount`, `description`.
- Idempotency key: `id` (stored as `transaction_id`).
- Success response: `200 {"success": true, "transactionId": "...", "duplicate": false}`.
- Any non-2xx response (400 invalid, 401 unauthorized) tells SePay to
  retry per its own retry policy.

## Migrating to production (MBBank live)

Do **not** attempt this until Phase 8 (end-to-end Test Mode) has PASSed,
per project rule #2. When ready:

1. Re-fetch and diff the current SePay webhook docs against
   `docs/TECHNICAL_NOTES.md`'s "UNVERIFIED" section; update
   `backend/src/services/sepay/schema.ts` and `normalize.ts` if anything
   changed.
2. Create a **live** webhook in the SePay dashboard pointing at the
   production backend URL (HTTPS required — see `docs/SECURITY.md`),
   with a freshly generated `SEPAY_WEBHOOK_API_KEY`.
3. Confirm MBBank is connected as the live bank account behind that
   SePay account.
4. Run one small real transaction end-to-end before relying on it.
