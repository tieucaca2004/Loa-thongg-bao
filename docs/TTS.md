# TTS (Text-to-Speech)

## Engine

V1 uses **Windows SAPI** (`System.Speech.Synthesis`), invoked locally on
the counter machine via a small PowerShell command
(`desktop/src/tts/TtsEngine.ts` → `WindowsSapiTtsEngine`). This satisfies:

- "Tiếng Việt" — any installed Vietnamese SAPI voice works; voice choice is
  a setting, not hard-coded.
- "Có thể chọn voice" — `listVoices()` shells out to enumerate installed
  SAPI voices; the renderer UI lets the operator pick one, saved to
  `settings.json` (`voice` field).
- "Điều chỉnh volume" — `settings.json`'s `volume` (0-100), applied on
  every `Speak()` call.
- "Có nút Test Speaker" / "Có nút Test TTS" — both buttons in the desktop
  UI call `ipcMain.handle('test-speaker' | 'test-tts', ...)`.
- "TTS chạy local trên máy quầy" — no cloud TTS API is used; `execFile`
  shells out to the local `powershell.exe`.

On non-Windows dev machines (this container included), `main.ts` falls
back to `NullTtsEngine` (no-op) so the app can still run/build/test; only a
real Windows machine at the counter needs `powershell.exe` + SAPI voices
installed (built into Windows).

## Notification text

Composed by `PaymentNotificationFormatter`
(`desktop/src/formatter/PaymentNotificationFormatter.ts`), kept isolated
per project rule #9 so wording can change later without touching the
payment engine or the TTS engine:

- No content: `"Đã nhận {amount bằng chữ} đồng."`
- With content: `"Đã nhận {amount bằng chữ} đồng. Nội dung chuyển khoản {content}."`

`{amount bằng chữ}` is produced by
`desktop/src/formatter/vietnameseNumber.ts`, a from-scratch Vietnamese
number-to-words converter (handles `mốt`/`lăm`/`tư`/`linh` spoken-form
rules) covering amounts up to 999,999,999,999 VND.

## Never announce twice / never lose the transaction

`desktop/src/tts/AnnouncementQueue.ts`:

- Keeps an in-memory `Set<transactionId>` of already-spoken ids. A repeat
  `PAYMENT_RECEIVED` event for the same id (e.g. a webhook the backend
  correctly deduped but which the desktop somehow received twice) is
  skipped, never re-spoken.
- Processes announcements one at a time (FIFO), so bursts of events don't
  talk over each other.
- If `TtsEngine.speak()` throws/rejects (speaker missing, PowerShell not
  found, SAPI error), the queue catches it, reports `status: 'failed'`
  with the error message, and does **not** mark the transaction as
  announced. The transaction itself was already persisted by the backend
  before the event was ever sent — a TTS failure can never lose it. The
  desktop UI shows a "🔊 lỗi phát âm" indicator and a manual "Phát lại
  thông báo lỗi" (retry) button, which calls
  `AnnouncementQueue.retryLastFailed()`.

## Testing

`desktop/src/__tests__/announcementQueue.test.ts` covers: normal speak,
duplicate-id suppression, large amounts, TTS engine throwing, retry after
failure succeeding, and serialized/FIFO processing under concurrent calls.
`desktop/src/__tests__/vietnameseNumber.test.ts` and `formatter.test.ts`
cover the number-to-words and message-formatting rules directly (all run
with a fake in-memory `TtsEngine`, no real audio hardware needed).
