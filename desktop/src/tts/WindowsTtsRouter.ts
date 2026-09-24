import type { TtsEngine } from './TtsEngine.js';

/**
 * Dispatches `speak()`/`listVoices()` between the classic SAPI engine and
 * the OneCore engine, by voice name (Phase 13D-R4).
 *
 * Neither underlying engine is modified: `WindowsSapiTtsEngine` stays the
 * sole, frozen implementation for classic SAPI voices ("Microsoft David
 * Desktop", "Microsoft Zira Desktop", ...); `WindowsOneCoreTtsEngine`
 * handles OneCore voices ("Microsoft An - Vietnamese (Vietnam)", ...).
 * `AnnouncementQueue` and `PaymentNotificationFormatter` are untouched —
 * this class only implements the same `TtsEngine` interface they already
 * depend on, so nothing above this layer needs to know a router exists.
 *
 * Routing rule: a voice name is routed to OneCore only if it was actually
 * seen in the OneCore engine's own `listVoices()` result. Everything else
 * (a classic voice name, an unrecognized name, or no voice at all) goes to
 * the classic SAPI engine — this is exactly the app's pre-existing default
 * behavior (no voice selected -> classic engine's own default voice), so a
 * user who never touches voice selection sees zero behavior change.
 */
export class WindowsTtsRouter implements TtsEngine {
  private oneCoreVoiceNames: Set<string> | null = null;

  constructor(
    private readonly classicEngine: TtsEngine,
    private readonly oneCoreEngine: TtsEngine
  ) {}

  async listVoices(): Promise<string[]> {
    const [classicNames, oneCoreNames] = await Promise.all([
      this.classicEngine.listVoices(),
      this.safeListOneCoreVoices(),
    ]);
    this.oneCoreVoiceNames = new Set(oneCoreNames);
    // Classic voices first, preserving the exact ordering/behavior a caller
    // saw before this router existed when only classic voices were present.
    const merged = [...classicNames];
    for (const name of oneCoreNames) {
      if (!merged.includes(name)) merged.push(name);
    }
    return merged;
  }

  async speak(text: string, options: { voice?: string; volume: number }): Promise<void> {
    if (this.oneCoreVoiceNames === null) {
      this.oneCoreVoiceNames = new Set(await this.safeListOneCoreVoices());
    }
    const useOneCore = options.voice != null && this.oneCoreVoiceNames.has(options.voice);
    const target = useOneCore ? this.oneCoreEngine : this.classicEngine;
    return target.speak(text, options);
  }

  /**
   * OneCore enumeration failing (e.g. a non-Windows-10+ host, or the WinRT
   * projection being unavailable) must never break the classic SAPI voice
   * list or misroute a classic voice - it degrades to "no OneCore voices
   * available" rather than throwing.
   */
  private async safeListOneCoreVoices(): Promise<string[]> {
    try {
      return await this.oneCoreEngine.listVoices();
    } catch {
      return [];
    }
  }
}
