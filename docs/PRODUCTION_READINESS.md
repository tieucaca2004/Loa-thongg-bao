# Production Readiness — Go/No-Go Checklist

**Overall: NOT READY.** Real Windows hardware + a physical speaker have
not been tested (see `docs/WINDOWS_ACCEPTANCE.md`), and real MBBank has
not been connected (nor should it be yet, per project rule "KHÔNG chuyển
sang MBBank thật cho đến khi PHASE 8 PASS" — Phase 8 is PASS in
simulation, but this checklist's own gate is real-hardware PASS, which is
still open). States below are factual PASS/FAIL/NOT TESTED only — nothing
here is upgraded to "ready" without evidence.

Last updated: 2026-09-23 (Phase 10).

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
- [x] typecheck PASS — `npx tsc --noEmit`
- [x] build PASS — `npm run build`
- [ ] Windows installer PASS — **NOT TESTED**. `npm run dist:win`
      (electron-builder + NSIS) is configured but has not been run on
      this Linux dev container (no Windows/wine toolchain available
      here) and has not been verified to actually install/uninstall
      cleanly on a real Windows machine. Also: no custom application
      icon has been supplied yet (electron-builder will fall back to a
      generic Electron icon) — add one under `build-resources/` before
      a real release build.
- [ ] Windows SAPI PASS — **NOT TESTED** on real Windows (this container
      cannot run `powershell.exe`/SAPI; `WindowsSapiTtsEngine` falls back
      to a no-op on non-Windows so the rest of the app still runs/tests).
      See `docs/WINDOWS_ACCEPTANCE.md` Test 5.
- [ ] physical speaker PASS — **NOT TESTED**. See
      `docs/WINDOWS_ACCEPTANCE.md` Test 6.
- [x] reconnect PASS (code path) — `BackendClient` auto-reconnect with
      backoff is unit-tested indirectly via its status-transition logic
      and exercised manually against a real backend process during
      development; not yet exercised as a full Electron GUI restart on
      real Windows (`docs/WINDOWS_ACCEPTANCE.md` Tests 8-11 — NOT TESTED
      on real hardware)

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
| Desktop (code/tests) | READY (all automated gates PASS) |
| Desktop (real hardware) | NOT TESTED |
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
2. `docs/WINDOWS_ACCEPTANCE.md` is run in full on a real Windows PC with
   a physical speaker at (or representative of) the actual counter, and
   every test row is updated to a real PASS/FAIL with evidence.
3. A production deployment target is chosen (hosting for the backend,
   HTTPS termination per `docs/SECURITY.md`) and its own environment
   variables are configured — none of this requires code changes, only
   deployment configuration.
4. Only then: link the real MBBank account inside SePay's own dashboard
   (never inside this codebase) and switch the configured webhook from
   Test Mode to production, per `docs/SEPAY.md`.
