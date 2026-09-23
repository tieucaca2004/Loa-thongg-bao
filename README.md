# A Tieu Payment Engine V1

```
MBBank → SePay → Webhook → Payment Engine → Desktop App → TTS → Loa máy tính
```

V1 proves this pipeline end-to-end using **SePay Test Mode / simulated
transactions** — no real MBBank connection yet. See `docs/ARCHITECTURE.md`
for the design and `docs/SEPAY.md` / `docs/TECHNICAL_NOTES.md` for what was
confirmed about SePay's webhook contract.

Two independent apps in this repo:

- `backend/` — Fastify + TypeScript + SQLite. Receives the SePay webhook,
  validates it, deduplicates it, persists it, and publishes a
  `PAYMENT_RECEIVED` event over WebSocket.
- `desktop/` — Electron + TypeScript, meant to run on the Windows counter
  machine. Connects to the backend, shows connection status and recent
  transactions, and speaks each new payment aloud via Windows SAPI TTS.

## 1. Clone

```bash
git clone <this-repo-url>
cd <repo>
```

## 2. Install

```bash
cd backend && npm install
cd ../desktop && npm install
```

## 3. Configure `.env`

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set `SEPAY_WEBHOOK_API_KEY` to a long random
string (this is the shared secret SePay must send as
`Authorization: Apikey <value>` — configure the **same** value on the
SePay dashboard side once you integrate with real Test Mode). Never commit
`.env`.

The desktop app has no `.env` — it stores its settings (backend WebSocket
URL, TTS voice, volume) in a local `settings.json` under the OS's app-data
folder, editable from the app's own settings UI (defaults to
`ws://localhost:3001`, see `desktop/src/settings.ts`).

## 4. Run backend

```bash
cd backend
npm run build
npm start
# or for local development with auto-reload:
npm run dev
```

This starts:
- `http://localhost:3000` — HTTP API (`POST /webhooks/sepay`, `GET /health`, `GET /transactions`)
- `ws://localhost:3001` — WebSocket event stream for the desktop app

## 5. Run desktop

Requires Windows for real TTS (Windows SAPI via PowerShell); on other
platforms it runs with a no-op TTS engine so you can still exercise the
connection/UI/formatter logic.

```bash
cd desktop
npm run dev
```

On first launch it connects to `ws://localhost:3001` (edit
`settings.json` or use the in-app settings if your backend is elsewhere).

## 6. Send a simulated transaction

Until you have SePay Test Mode dashboard access wired up, use the included
script, which sends the exact payload shape documented in
`docs/WEBHOOK.md`:

```bash
node scripts/simulate-webhook.mjs \
  --amount 100000 --content "ATIEU 1234" \
  --api-key <same value as SEPAY_WEBHOOK_API_KEY>
```

Add `--repeat 10` to prove idempotency (SePay-style retries) — you should
see 1 "duplicate: false" followed by 9 "duplicate: true", but the database
and desktop only ever record/announce it once.

## 7. Verify the webhook was received

```bash
curl -s http://localhost:3000/health
curl -s "http://localhost:3000/transactions?limit=10"
```

## 8. Verify the database

```bash
sqlite3 backend/data/payment-engine.sqlite "select transaction_id, amount, gateway, status from transactions order by received_at desc limit 10;"
sqlite3 backend/data/payment-engine.sqlite "select outcome, transaction_id, reason from webhook_logs order by received_at desc limit 20;"
```

## 9. Verify TTS

On the Windows desktop app: click **🔊 Test Speaker** (plays a short
phrase) and **🗣 Test TTS** (speaks a full sample notification). Then send
a simulated transaction (step 6) and confirm it appears in the app's
history and is spoken aloud, with a "🔊 Đã phát thông báo" indicator.

## Documentation

- `docs/ARCHITECTURE.md` — system design, data flow, guarantees
- `docs/SEPAY.md` — SePay integration notes, Test Mode, migration to live MBBank
- `docs/WEBHOOK.md` — webhook request/response contract, normalized transaction model
- `docs/TTS.md` — TTS engine, notification formatting, dedupe/retry
- `docs/SECURITY.md` — secrets, auth, validation, transport
- `docs/TESTING.md` — test suite index and acceptance-test status
- `docs/TECHNICAL_NOTES.md` — what's confirmed vs. unverified from SePay's docs

## Project status

Phases 1–8 (repo/architecture, backend skeleton, webhook receiver,
DB + idempotency, event system, desktop app, TTS, end-to-end Test Mode) are
implemented and covered by automated tests where the environment allows
(see `docs/TESTING.md` for the acceptance-test table, including what still
needs manual verification on a real Windows machine). Phases 9–10
(security hardening beyond the V1 baseline in `docs/SECURITY.md`, and a
full production-readiness review) and any move to a live MBBank connection
are **not** started, per project rule: "KHÔNG chuyển sang MBBank thật cho
đến khi PHASE 8 PASS."
