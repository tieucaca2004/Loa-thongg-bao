# Production Readiness — Go/No-Go Checklist

**Overall: NOT READY.** Real Windows hardware + a physical speaker have
not been tested (see `docs/WINDOWS_ACCEPTANCE.md`), and real MBBank has
not been connected (nor should it be yet, per project rule "KHÔNG chuyển
sang MBBank thật cho đến khi PHASE 8 PASS" — Phase 8 is PASS in
simulation, but this checklist's own gate is real-hardware PASS, which is
still open). States below are factual PASS/FAIL/NOT TESTED only — nothing
here is upgraded to "ready" without evidence.

Last updated: 2026-09-23 (Phase 12).

## Backend

- [x] tests PASS — 33/33 (`cd backend && npm test`)
- [x] typecheck PASS — `npx tsc --noEmit`
- [x] build PASS — `npm run build`
- [x] security PASS — Phase 9 hardening: rate limiting, centralized error
      handling (no false success on DB failure), event-bus subscriber
      isolation, secret redaction verified in real log output, CORS
      opt-in only (see `docs/SECURITY.md`)
- [x] rate limiting PASS — per-IP limit on `POST /webhooks/sepay`,
      configurable, verified not to block a realistic SePay retry burst
      (`hardening.test.ts`)
- [x] DB persistence PASS — WAL mode, graceful shutdown, survives a
      simulated restart (`idempotency.test.ts`)
- [x] idempotency PASS — `transaction_id` UNIQUE constraint; 10x/8x
      identical webhook delivery → 1 row, 1 event, verified via both
      automated tests and manual `scripts/simulate-webhook.mjs` runs

## Desktop

- [x] tests PASS — 16/16 (`cd desktop && npm test`)
- [x] typecheck PASS — `npm run typecheck` (now covers both the main
      process and the separately-compiled preload script, see below)
- [x] build PASS — `npm run build`
- [x] **real-app smoke test PASS (Linux, headless)** — Phase 11 launched
      the actual compiled Electron app under Xvfb and found + fixed a
      real defect: `preload.ts` was compiled as ESM (package.json
      `"type": "module"`) but Electron always loads preload scripts as
      CommonJS, so `window.atieu` was never exposed and the entire
      renderer UI was non-functional (`Cannot use import statement
      outside a module`, then `Cannot read properties of undefined`).
      This would have broken the app **on Windows too**, not just here —
      no unit test caught it because unit tests never load a real
      preload script. Fixed via a dedicated CommonJS build step
      (`tsconfig.preload.json` → `dist/preload.cjs`). After the fix, the
      real Electron app launched, loaded the renderer, connected to the
      backend's WebSocket (`desktop client connected` in backend logs),
      and processed a real simulated `PAYMENT_RECEIVED` event with zero
      console errors. See `docs/WINDOWS_ACCEPTANCE_RESULTS.md`.
- [x] electron-builder packaging PASS (Linux) — `electron-builder --win
      --x64` successfully produces `release/win-unpacked/A Tieu
      Payment.exe` (correct icon applied, author set, no warnings).
- [ ] Windows NSIS installer (.exe) PASS — **NOT TESTED**. The final NSIS
      packaging step requires `wine` on Linux; this container has none
      and `apt-get install wine64` failed on unrelated package-mirror
      404s (not a project blocker, an environment one). Re-confirmed in
      Phase 12: same failure point, packaging config now also excludes
      source maps and test files, sets a stable artifact name
      (`A-Tieu-Payment-Setup.exe`), and `perMachine: false` is explicit
      (no admin required). Must be run either on real Windows or a Linux
      machine with wine installed. See `docs/WINDOWS_ACCEPTANCE_RESULTS.md`.
- [x] preload regression guard PASS (Phase 12) — `desktop/src/__tests__/preloadBuild.test.ts`
      runs a real build and asserts `dist/preload.cjs` exists as
      CommonJS and `dist/preload.js` does not, so the ESM/CJS defect
      found in Phase 11 cannot silently regress. Verified to actually
      catch the regression (temporarily reverted the fix, confirmed the
      test fails, restored the fix, confirmed it passes again).
- [x] data safety PASS (Phase 12) — reviewed all desktop source: no
      password/secret/apiKey/OTP/PIN strings anywhere in `desktop/src/`;
      `DesktopSettings` (the only thing persisted, under
      `%APPDATA%\A Tieu Payment\settings.json`) contains exactly
      `backendWsUrl`, `voice`, `volume`, `autoStart` — no credentials of
      any kind. The webhook API key lives only in the backend's `.env`.
- [ ] Windows SAPI PASS — **NOT TESTED** on real Windows (this container
      cannot run `powershell.exe`/SAPI; `WindowsSapiTtsEngine` falls back
      to a no-op on non-Windows so the rest of the app still runs/tests).
      See `docs/WINDOWS_ACCEPTANCE.md` Test 5.
- [ ] physical speaker PASS — **NOT TESTED**. See
      `docs/WINDOWS_ACCEPTANCE.md` Test 6.
- [x] reconnect PASS (code path + real headless run) — `BackendClient`
      auto-reconnect with backoff is unit-tested, and the real Electron
      app was relaunched multiple times against the same backend during
      Phase 11, reconnecting cleanly each time (backend log shows
      repeated connect/disconnect pairs). Not yet exercised as a full
      installed-app restart on real Windows (`docs/WINDOWS_ACCEPTANCE.md`
      Tests 8-11 — NOT TESTED on real hardware).

## Integration

- [ ] SePay official documentation verified — **BLOCKED**.
      `developer.sepay.vn` / `docs.sepay.vn` remain blocked by this
      container's network egress proxy as of the Phase 10 re-check
      (2026-09-23). All SePay-specific facts in this project come from
      web search result snippets only, recorded with their confidence
      level in `docs/TECHNICAL_NOTES.md`. Unblocking requires a human to
      add those hosts to the environment's allowed domains.
- [x] MBBank integration verified (webhook-based) — **PARTIALLY, via
      search only**: MBBank is confirmed (via search snippets, not the
      primary docs) to be among the banks SePay supports for webhook
      notifications, and the account-linking flow is described at a high
      level. The exact live webhook field values for an MBBank account
      specifically have not been confirmed against a real payload.
- [x] Test Mode PASS — proven via `scripts/simulate-webhook.mjs`
      end-to-end against the real backend (webhook → DB → WebSocket
      event), per `docs/TESTING.md`. SePay's own Test Mode dashboard
      itself has not been exercised (blocked docs site + no live SePay
      account credentials in this environment) — the simulation script
      sends the same payload shape as documented, not payloads generated
      by SePay's own UI.
- [ ] real MBBank connection — **NOT YET ENABLED**, and must not be,
      until: (a) the SePay documentation block above is resolved and the
      webhook contract is confirmed against the real docs, and (b) the
      Windows hardware acceptance plan (`docs/WINDOWS_ACCEPTANCE.md`) has
      actually PASSed on the real counter machine. No real MBBank
      credentials (password/OTP/PIN) have been requested or stored by
      this project, and none should be — that flow is entirely inside
      SePay's own dashboard, not this codebase.

## Summary

| Area | Status |
|---|---|
| Backend | READY (all automated gates PASS) |
| Desktop (code/tests/real-app smoke test) | READY (all automated gates PASS; a real preload-loading defect was found and fixed via an actual Electron run) |
| Desktop (Windows installer .exe) | NOT TESTED (packaging up to wine-dependent NSIS step PASSES) |
| Desktop (SAPI/speaker on real hardware) | NOT TESTED |
| SePay docs | BLOCKED (network egress) |
| MBBank live connection | NOT CONNECTED (by design, not yet appropriate) |
| **Overall production readiness** | **NOT READY** |

## What would move this to READY

1. A human unblocks `developer.sepay.vn`/`docs.sepay.vn` from this or a
   future session's network policy (or the docs are read from another
   machine), and the webhook contract in
   `backend/src/services/sepay/schema.ts` /
   `backend/src/services/sepay/normalize.ts` is confirmed or corrected
   against the real docs.
2. `docs/WINDOWS_TEST_GUIDE.md` (Phase 12's practical 24-step procedure,
   an expanded version of `docs/WINDOWS_ACCEPTANCE.md`) is run in full on
   a real Windows PC with a physical speaker at (or representative of)
   the actual counter, using the `release/windows-test/` bundle (built
   locally, not committed — see below), and every test row is updated to
   a real PASS/FAIL with evidence — see `docs/WINDOWS_ACCEPTANCE_RESULTS.md`
   for what Phase 11/12 already ran (Linux-only, pipeline-level) versus
   what still needs real hardware. The NSIS `.exe` installer also needs
   to be produced (either on real Windows or a Linux machine with
   `wine`) and tested for clean install/uninstall.
3. A production deployment target is chosen (hosting for the backend,
   HTTPS termination per `docs/SECURITY.md`) and its own environment
   variables are configured — none of this requires code changes, only
   deployment configuration.
4. Only then: link the real MBBank account inside SePay's own dashboard
   (never inside this codebase) and switch the configured webhook from
   Test Mode to production, per `docs/SEPAY.md`.
