# Windows Test Guide — A Tieu Payment Desktop

**Purpose**: verify the desktop app on real Windows hardware. This is a
software/hardware acceptance test using **simulated transactions only**.
Do not connect a real MBBank account, enter banking credentials, an OTP,
a PIN, or send real money at any point in this guide.

**Assumed tester setup**: Windows 10/11, internet access, working
physical speakers, and administrator access only if the step you're on
actually needs it (most don't — see Step 1).

For every test below, fill in all three lines. Never leave a step
ambiguous — if you didn't observe it, write `ACTUAL: not run` and
`PASS/FAIL: NOT TESTED`, never guess PASS.

## Prerequisites

1. A backend reachable from this Windows PC — either running on this
   same PC, or on another machine on the same network. See the
   repository's `README.md` for how to start it
   (`cd backend && npm run build && npm start`), with
   `SEPAY_WEBHOOK_API_KEY` set in `backend/.env`.
2. The desktop app bundle: either `release/windows-test/A Tieu Payment
   (unpacked)/A Tieu Payment.exe` from this repo's build, or the NSIS
   installer if one has been produced (`desktop/release/A-Tieu-Payment-Setup.exe`
   — not guaranteed to exist, see `docs/PRODUCTION_READINESS.md`).
3. `scripts/simulate-webhook.mjs` (from this repo) available to run from
   any machine that can reach the backend's HTTP port, or a copy of it.

---

### TEST 1 — Install
EXPECTED: If using the installer (`A-Tieu-Payment-Setup.exe`), it installs without requiring administrator elevation (per-user install), creates a Start Menu and Desktop shortcut. If using the unpacked folder, no install step is needed — just copy the folder.
ACTUAL:
PASS/FAIL:

### TEST 2 — Launch
EXPECTED: Double-clicking the shortcut or `A Tieu Payment.exe` opens a window titled "A TIEU PAYMENT" within a few seconds, no crash, no error dialog.
ACTUAL:
PASS/FAIL:

### TEST 3 — Verify backend URL/configuration
EXPECTED: On first launch, `%APPDATA%\A Tieu Payment\settings.json` is created automatically with `backendWsUrl: "ws://localhost:3001"`. If your backend is on a different host, edit that file (or the in-app settings) before continuing.
ACTUAL:
PASS/FAIL:

### TEST 4 — Verify connection indicator
EXPECTED: With the backend running and reachable, the status indicator shows "🟢 CONNECTED" within a few seconds.
ACTUAL:
PASS/FAIL:

### TEST 5 — Click Test Speaker
EXPECTED: Clicking "🔊 Test Speaker" plays a short audio phrase ("Kiểm tra loa. Xin chào.") through the system's default audio output.
ACTUAL:
PASS/FAIL:

### TEST 6 — Click Test TTS
EXPECTED: Clicking "🗣 Test TTS" speaks a full sample Vietnamese sentence via Windows SAPI.
ACTUAL:
PASS/FAIL:

### TEST 7 — Verify Vietnamese speech
EXPECTED: The speech from Test 6 is intelligible Vietnamese, not English or another language, and not garbled. **If no Vietnamese SAPI voice is installed on this Windows machine**, the result is `BLOCKED — Vietnamese SAPI voice unavailable`, not a FAIL of the application — see "Vietnamese voice requirement" below.
ACTUAL:
PASS/FAIL:

### TEST 8 — Run simulated 100,000 VND transaction
Run (from the backend machine, or any machine that can reach it):
```bash
node scripts/simulate-webhook.mjs --amount 100000 --content "ATIEU TEST" --id WIN-TEST-001 --api-key <SEPAY_WEBHOOK_API_KEY>
```
EXPECTED: Command returns `HTTP 200` with `"duplicate": false`.
ACTUAL:
PASS/FAIL:

### TEST 9 — Verify UI
EXPECTED: Within ~1 second of Test 8, the app's "Giao dịch mới" section shows 100,000 VND and content "ATIEU TEST", and it appears at the top of the history list.
ACTUAL:
PASS/FAIL:

### TEST 10 — Verify physical speaker
EXPECTED: The app speaks aloud through the physical speaker: "Đã nhận một trăm nghìn đồng. Nội dung chuyển khoản ATIEU TEST." — audible, correct amount in words, correct content.
ACTUAL:
PASS/FAIL:

### TEST 11 — Send same transaction 10 times
Run:
```bash
node scripts/simulate-webhook.mjs --amount 100000 --content "ATIEU TEST" --id WIN-TEST-001 --api-key <SEPAY_WEBHOOK_API_KEY> --repeat 10
```
EXPECTED: All 10 requests return `HTTP 200` (1st `duplicate:false`, rest `duplicate:true`).
ACTUAL:
PASS/FAIL:

### TEST 12 — Verify only one announcement
EXPECTED: Despite 10 webhook deliveries in Test 11, the app speaks **exactly once** in total for `WIN-TEST-001` (across Tests 10 and 11 combined — the transaction is not re-announced), and the history list shows only one entry for it.
ACTUAL:
PASS/FAIL:

### TEST 13 — Restart application
EXPECTED: Close the app fully and relaunch it. It opens cleanly with no error.
ACTUAL:
PASS/FAIL:

### TEST 14 — Verify reconnect
EXPECTED: After the Test 13 restart, the status indicator returns to "🟢 CONNECTED" automatically, without needing to change any settings.
ACTUAL:
PASS/FAIL:

### TEST 15 — Enable auto-start
EXPECTED: Check "Tự động khởi động cùng Windows" in the app's settings. No error; the setting is saved (persists if you close and reopen the app).
ACTUAL:
PASS/FAIL:

### TEST 16 — Restart Windows
EXPECTED: Fully restart the Windows PC (not just log off).
ACTUAL:
PASS/FAIL:

### TEST 17 — Verify application starts
EXPECTED: After Windows finishes booting and you log in, the app opens automatically without manual action, per the Test 15 setting.
ACTUAL:
PASS/FAIL:

### TEST 18 — Disconnect network
EXPECTED: Disable Wi-Fi/Ethernet on the Windows PC (or otherwise block the backend's address) while the app is running.
ACTUAL:
PASS/FAIL:

### TEST 19 — Verify disconnected state
EXPECTED: The status indicator changes to "🔴 DISCONNECTED" within a few seconds. The app does not crash or freeze; the window stays responsive.
ACTUAL:
PASS/FAIL:

### TEST 20 — Reconnect network
EXPECTED: Re-enable the network connection.
ACTUAL:
PASS/FAIL:

### TEST 21 — Verify recovery
EXPECTED: The app automatically returns to "🟢 CONNECTED" without needing a restart or any manual reconfiguration.
ACTUAL:
PASS/FAIL:

### TEST 22 — Uninstall
EXPECTED (installer only — skip if using the unpacked folder): Uninstalling via Windows "Apps & Features" (or the Start Menu uninstall shortcut) removes the application cleanly, with no leftover process running.
ACTUAL:
PASS/FAIL:

### TEST 23 — Reinstall
EXPECTED (installer only): Running the installer again after Test 22 succeeds without error.
ACTUAL:
PASS/FAIL:

### TEST 24 — Verify configuration behavior
EXPECTED: After reinstalling, `%APPDATA%\A Tieu Payment\settings.json` from before the uninstall is still present and its settings (voice, volume, auto-start, backend URL) are still applied — uninstalling the application does not delete per-user app data (Windows/NSIS default: uninstalling an app does not touch `%APPDATA%` unless the installer explicitly clears it, which this one does not).
ACTUAL:
PASS/FAIL:

---

## Vietnamese voice requirement

The desktop app does not bundle a TTS voice — it uses whatever Windows
SAPI voices are installed on the machine. A Vietnamese voice is **not**
included in a default Windows install and must be added:

- Windows Settings → Time & Language → Language & Region → Add a
  language → Vietnamese, then install its optional "speech" /
  text-to-speech component.

If Test 7 shows no Vietnamese voice available in the app's voice
dropdown (or the app falls back to a non-Vietnamese voice), record:

```
Result: BLOCKED — Vietnamese SAPI voice unavailable.
```

**Do not classify this as an application failure** until you've
confirmed no Vietnamese voice is installed on this Windows machine (per
project rule: never silently substitute another voice, and never
misclassify a missing-voice environment issue as a code defect).

## Data safety note

Confirm nothing in `%APPDATA%\A Tieu Payment\settings.json` contains a
bank password, OTP, PIN, or API secret — it should only ever contain
`backendWsUrl`, `voice`, `volume`, and `autoStart`. The webhook API key
lives only in the backend's `.env` (never in the desktop app or its
settings file, and never visible to the renderer/browser process).

## Recording results

Copy `TEST-CHECKLIST.txt` (in the same `release/windows-test/` bundle as
this guide) and fill it in by hand, or fill in the ACTUAL/PASS-FAIL lines
above directly in a copy of this file. Attach the completed results to
`docs/WINDOWS_ACCEPTANCE_RESULTS.md` before updating any row in
`docs/PRODUCTION_READINESS.md` to PASS.
