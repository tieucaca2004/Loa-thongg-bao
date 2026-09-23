# Windows Acceptance Test Results

**This is a record of what was actually run, where, and what the
evidence shows — not a claim that real Windows hardware acceptance has
passed.** Per project rule: NOT TESTED is never upgraded to PASS without
real evidence.

## Environment this session ran in

```
OS:      Linux 6.18.44-fc-v37 x86_64 (NOT Windows)
Node:    v22.22.2
npm:     10.9.7
Electron: 32.1.2 (devDependency)
PowerShell: not present
Windows SAPI: not present (Linux has no SAPI)
Audio output device: none confirmed available
```

This confirms the session environment is Linux, not Windows, exactly as
`docs/WINDOWS_ACCEPTANCE.md` anticipated. Per that plan's instructions,
hardware-dependent tests below are marked **NOT TESTED** rather than
faked. What *could* be verified without Windows hardware — the full
pipeline up to (but not including) the physical TTS/speaker hop — was
verified for real, not assumed, using:
- the actual built backend (`node dist/server.js`)
- the actual built Electron app (`electron dist/main.js`), launched
  headlessly under Xvfb (`xvfb-run`) with `--no-sandbox --disable-gpu`
- `scripts/simulate-webhook.mjs` against the real running backend

## A real defect found and fixed during this phase

Launching the actual compiled Electron app (not just unit tests) surfaced
a genuine bug that would have broken the app **on Windows too**, not just
in this Linux container: the desktop `package.json` has `"type": "module"`,
so `tsc` compiled `preload.ts` to ESM (`import`/`export` syntax). Electron
loads preload scripts as CommonJS regardless of the app's module type, so
the renderer logged:
```
Unable to load preload script: .../dist/preload.js
SyntaxError: Cannot use import statement outside a module
Uncaught TypeError: Cannot read properties of undefined (reading 'onConnectionStatus')
```
i.e. `window.atieu` was never exposed and the entire UI (connection
status, history, TTS buttons, settings) was non-functional — on any
platform, not just Linux.

**Fix**: `preload.ts` is now compiled separately via
`tsconfig.preload.json` (CommonJS) to `dist/preload.cjs`, and
`main.ts`'s `BrowserWindow` now points at `preload.cjs`. Re-running the
same headless Electron launch after the fix showed **no preload/renderer
errors**, and the backend log showed the app actually completing its
WebSocket handshake (`desktop client connected`).

This means without this phase's real-app run, the packaged Windows app
would have shipped broken. Evidence this actually matters is worth more
weight than any amount of unit testing, since none of the automated
tests (which mock everything) or the Linux native-fallback path
exercised real Electron's preload loading.

## What was verified (backend/event pipeline, real processes)

| Step | What was run | Result |
|---|---|---|
| Backend build + start | `npm run build && node dist/server.js` | Started clean, `/health` returns ok |
| Electron app launch (headless, Linux) | `xvfb-run electron dist/main.js` | Launches, loads renderer, preload exposes `window.atieu`, connects to backend WS (confirmed via backend log: `desktop client connected`) |
| Simulated payment (100,000 VND, "ATIEU TEST 001") | `scripts/simulate-webhook.mjs` while Electron app running | Webhook accepted (200), event delivered to the running Electron process with zero renderer console errors |
| Duplicate 10x (`--repeat 10`) | Same script, same transaction id | Exactly 1 row in `GET /transactions`, exactly 1 `PAYMENT_RECEIVED` WebSocket event observed by a raw WS client |
| Backend restart | Killed and relaunched `node dist/server.js` against the same SQLite file | All prior transactions still present in `GET /transactions` after restart |
| Electron-builder packaging | `electron-builder --win --x64` | Successfully produces `release/win-unpacked/A Tieu Payment.exe` (win32-x64 Electron bundle, correct icon applied, no more "author is missed" / "default icon is used" warnings) — **fails only at the final NSIS installer + code-signing step with `wine is required`**, which is expected: this container has no `wine` and none could be installed (package mirror errors unrelated to this project) |

## Full results table (per docs/WINDOWS_ACCEPTANCE.md)

| Test | Result | Evidence |
|---|---|---|
| Windows startup | NOT TESTED | No Windows machine in this environment. Linux-headless launch of the same binary succeeded (see above) — a positive signal, not a substitute. |
| SAPI | NOT TESTED | Linux has no Windows SAPI. `WindowsSapiTtsEngine` falls back to `NullTtsEngine` on this platform by design (`process.platform !== 'win32'`), so the SAPI code path itself was not exercised. |
| Vietnamese TTS | NOT TESTED | Same reason — needs real SAPI. `formatter.test.ts` proves the exact Vietnamese string produced ("Đã nhận một trăm nghìn đồng...") but not that SAPI speaks it correctly. |
| Physical speaker | NOT TESTED | No speaker hardware in this container. |
| Simulated payment | PASS (pipeline through the real Electron app, minus audio) | See table above — webhook → DB → WebSocket → Electron IPC all verified with zero errors |
| Duplicate 10x | PASS (pipeline-level) | See table above — 1 row, 1 event, verified against the real running backend, not just unit tests |
| Backend restart | PASS | See table above |
| Desktop restart | NOT TESTED (real hardware) | The reconnect *logic* is unit-tested (`BackendClient`) and the app was relaunched multiple times headlessly during this session, reconnecting each time — but a full "restart the installed Windows app" cycle was not run |
| Windows reboot / auto-start | NOT TESTED | Requires a real Windows login cycle; `app.setLoginItemSettings` is a no-op on this platform (`process.platform !== 'win32'` guard) |
| Network recovery | NOT TESTED (real hardware) | `BackendClient`'s reconnect-with-backoff is unit-level only in this phase; not exercised against a real network interface disconnect |
| TTS failure | PASS (pipeline-level, via `NullTtsEngine`/unit tests) | `announcementQueue.test.ts` proves a rejecting TTS engine never loses the transaction and supports retry; the real SAPI failure mode (e.g. missing voice) was not exercised since there is no SAPI here |
| Installer (NSIS build) | PARTIAL — packaging PASS, final installer NOT TESTED | electron-builder successfully builds the unpacked Windows app; the NSIS `.exe` step requires `wine` on Linux, unavailable in this container (attempted `apt-get install wine64`, failed on unrelated package-mirror 404s) |
| Uninstall | NOT TESTED | No installer was produced to uninstall |

## Conclusion

This phase materially increased confidence (a real, previously-undetected
defect was found and fixed) but does **not** move
`docs/PRODUCTION_READINESS.md`'s Windows-hardware rows to PASS. Those
remain NOT TESTED until run on an actual Windows PC with a physical
speaker, per `docs/WINDOWS_ACCEPTANCE.md`.
