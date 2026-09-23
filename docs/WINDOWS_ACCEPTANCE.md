# Windows Hardware Acceptance Test Plan

**Status: NOT YET RUN.** This plan has not been executed on real Windows
hardware — this project was developed in a Linux cloud container with no
Windows machine, no physical speaker, and no Electron GUI available. Do
not mark any row below as PASS until it has actually been run on the real
counter machine. See `docs/PRODUCTION_READINESS.md` for the overall
go/no-go checklist this feeds into.

## Prerequisites

- A Windows 10/11 PC (the actual counter machine, or a representative one)
  with speakers connected and audible.
- Node.js installed (for `npm run dev`), or the packaged installer from
  `npm run dist:win` (see `README.md` / `docs/ARCHITECTURE.md`).
- The backend running somewhere reachable from that PC (same machine or
  same LAN), with `SEPAY_WEBHOOK_API_KEY` set.
- `scripts/simulate-webhook.mjs` available (same repo, or copied) to fire
  simulated transactions without needing SePay dashboard access.

## Tests

### TEST 1 — Start backend
```
cd backend && npm run build && npm start
```
Expected: process starts, logs "A Tieu Payment Engine backend started",
`curl http://localhost:3000/health` returns `{"status":"ok",...}`.

### TEST 2 — Start Electron
```
cd desktop && npm run dev
```
(or launch the installed app if using the packaged installer)
Expected: the app window opens, titled "A TIEU PAYMENT".

### TEST 3 — Verify Connected
Expected: the status indicator shows "🟢 CONNECTED" within a few seconds
of the backend being up.

### TEST 4 — Run simulated transaction
```
node scripts/simulate-webhook.mjs --amount 100000 --content "ATIEU 1234" --api-key <key>
```
Expected: the desktop app's "Giao dịch mới" section and history list
update with the 100,000 VND transaction and its content, within ~1 second.

### TEST 5 — Verify Windows SAPI speaks Vietnamese
Expected: shortly after Test 4, the app speaks (via Windows SAPI): "Đã
nhận một trăm nghìn đồng. Nội dung chuyển khoản ATIEU 1234." — in
Vietnamese, intelligible pronunciation.

### TEST 6 — Verify actual physical speaker output
Expected: audio is audible from the counter's physical speaker (not just
a virtual/muted device) at the configured volume level. Adjust the
volume slider and Test Speaker button to confirm it takes effect.

### TEST 7 — Repeat same transaction 10 times
```
node scripts/simulate-webhook.mjs --amount 100000 --content "ATIEU 1234" --id repeat-test-1 --repeat 10 --api-key <key>
```
Expected: **exactly one** announcement is spoken and the history shows
exactly one entry for `repeat-test-1`, despite 10 webhook deliveries.

### TEST 8 — Restart desktop
Close and relaunch the Electron app.
Expected: it reconnects to the backend automatically (status goes
disconnected → connected) without needing to restart the backend.

### TEST 9 — Restart backend
With the desktop app still running, stop and restart the backend process.
Expected: the desktop app's status briefly shows disconnected, then
automatically reconnects once the backend is back up, without needing to
restart the desktop app.

### TEST 10 — Disconnect Internet temporarily
Disable the counter machine's network connection (or block the backend's
port) while the desktop app is running.
Expected: the status indicator shows disconnected; the app does not
crash or freeze; the UI stays responsive.

### TEST 11 — Reconnect Internet
Re-enable the network connection.
Expected: the app automatically detects the backend again and returns to
"🟢 CONNECTED" without manual intervention (no restart needed).

### TEST 12 — TTS failure
Simulate a TTS failure (e.g. temporarily rename/disable the configured
SAPI voice, or block `powershell.exe` execution) and send a simulated
transaction.
Expected: the transaction still appears in `GET /transactions` on the
backend and in the desktop's history list; the desktop shows a TTS error
indicator; the transaction is **not lost**. Use the "🔁 Phát lại thông báo
lỗi" (retry) button after restoring TTS and confirm it can announce late.

## Recording results

For each test, record: date, Windows version, PASS/FAIL, and any notes
(e.g. voice used, observed latency). Attach this record (or a link to it)
to `docs/PRODUCTION_READINESS.md` before treating the "Windows hardware"
row there as PASS.
