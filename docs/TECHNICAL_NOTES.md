# Technical Notes — SePay Integration Research

This document records what was confirmed from SePay's official documentation
(`developer.sepay.vn`, `docs.sepay.vn`) and what could **not** be verified
directly, per project rule #3 ("do not guess endpoints/fields; record
ambiguity here instead").

## Access constraint

This development container's network egress proxy blocks
`developer.sepay.vn` and `docs.sepay.vn` directly (`EGRESS_BLOCKED`). This
was re-checked during Phase 10 (2026-09-23) and the block is still in
effect — both `WebFetch` calls returned `EGRESS_BLOCKED`. To reach these
hosts, the environment's Network access setting needs `developer.sepay.vn`
/ `docs.sepay.vn` added to its allowed domains (Environment settings →
Network access), which requires a human with access to that setting; this
session cannot change it itself. All information below was gathered via
web search snippets that quote or summarize those pages, not by fetching
the full pages. Anything not explicitly quoted in a search result is
marked **UNVERIFIED** below and was **not** hard-coded into the
implementation — instead the code isolates it behind an adapter
(`backend/src/services/sepay/normalize.ts`) so it can be corrected in one
place once the docs are reachable.

## Confirmed from search snippets

- **Webhook transport**: SePay sends an HTTP `POST` with a JSON body to the
  URL configured in the SePay dashboard.
- **Payload fields** (names as documented): `id`, `gateway`, `transactionDate`,
  `accountNumber`, `code`, `content`, `transferType` (`"in"` | `"out"`),
  `transferAmount`, `accumulated`, `subAccount`, `referenceCode`,
  `description`.
- **Authentication**: SePay supports an API Key mode, sending header
  `Authorization: Apikey YOUR_API_KEY`, and optionally OAuth2 or no auth,
  depending on how the webhook is configured in the dashboard.
- **Success/retry semantics**: SePay retries when the response is outside
  the 2xx range or the connection fails; retry backoff follows a
  Fibonacci-like increasing interval, up to 8 total attempts (1 initial +
  7 retries) over roughly 33 minutes, after which the webhook is marked
  "Failed".
- **Idempotency guidance**: SePay's own docs recommend deduplicating on the
  `id` field, optionally combined with `referenceCode` + `transferType` +
  `transferAmount`.
- **Test mode / sandbox**: `my.sepay.vn` has a "Test mode" toggle in the
  sidebar. A separate sandbox registration exists at `my.dev.sepay.vn`
  (requires contacting SePay to activate). In Test mode you create a
  simulated bank account and can trigger simulated transactions from the
  dashboard UI, which fire the same webhook shape to your configured
  endpoint. Test-mode data is isolated from live data/balances.
- **MBBank support (Phase 10, re-verified via search only)**: SePay
  officially lists MBBank among the banks it supports for webhook-driven
  transaction notifications. Linking a bank account for webhooks is done
  from `my.sepay.vn` → Dashboard → Bank accounts → Add account: pick the
  bank + account type, enter the account number, then either provide
  internet-banking login credentials or connect via OAuth (method depends
  on the bank), after which SePay verifies the link and the account
  becomes "Active". **Do not attempt this step for V1** — it would require
  entering real MBBank credentials, which this project must never request
  or store (see `docs/PRODUCTION_READINESS.md` and project rule 10.3).
- **A separate "Payment Gateway" product exists** (VietQR / NAPAS / card
  payments via `my.sepay.vn/pg`), authenticated with HTTP Basic Auth using
  a `merchant_id:secret_key` pair. **This is a different SePay product
  from the bank-webhook flow this project integrates with** — V1 uses only
  the bank-webhook product (`Authorization: Apikey ...`). Do not confuse
  the two; a future phase that wants VietQR/card payments would need its
  own adapter and its own credentials, out of scope here.

## UNVERIFIED — treat as provisional, do not extend without checking docs

- The exact JSON casing/nesting for `id` (numeric vs string) and whether it
  is called `id` or `gateway_id` was not confirmed via a quoted payload
  sample.
- Whether SePay signs the payload body (HMAC signature header) in addition
  to the API-key header was not confirmed. **This implementation assumes
  API-key header auth only** (`Authorization: Apikey <key>` compared with
  `crypto.timingSafeEqual` against `SEPAY_WEBHOOK_API_KEY`), and does not
  implement HMAC verification. Revisit once the docs are reachable.
- Exact success response body SePay expects is unconfirmed beyond "2xx".
  This implementation returns `200 { "success": true }`.
- Whether `code` is a bank-provided transaction code distinct from `id`,
  and which field is guaranteed globally unique, is unconfirmed. This
  implementation uses `id` (aliased in our normalized model as
  `transaction_id`) as the unique idempotency key, per the documented
  recommendation, and additionally keeps `reference_code` for reconciliation.
- MBBank-specific quirks in Test Mode (bank list availability, whether
  MBBank is selectable as a Test-mode account) were not confirmed.

## Consequence for architecture (see `docs/SEPAY.md`)

Because the exact wire format has open questions, the webhook route does
**not** trust the raw SePay payload shape beyond what's confirmed above; all
mapping into our `Transaction` model happens in one isolated adapter
function (`normalizeSepayPayload`), validated with a schema (`zod`) that
only requires fields we're confident about and passes through the rest as
`raw_payload` for audit/reconciliation. This keeps the blast radius of a
wrong assumption to one file and one test suite.
