import type { TtsEngine } from './TtsEngine.js';
import { PaymentNotificationFormatter, type FormattableTransaction } from '../formatter/PaymentNotificationFormatter.js';

export interface AnnouncementSettings {
  voice?: string;
  volume: number; // 0-100
}

export type AnnouncementResult =
  | { status: 'spoken'; transactionId: string; text: string }
  | { status: 'skipped_duplicate'; transactionId: string }
  | { status: 'failed'; transactionId: string; error: string };

/**
 * Serializes and dedupes TTS announcements.
 *
 * Guarantees (per project spec #1):
 *  - The same transactionId is never spoken twice, even if the backend
 *    event, a manual "history" replay, or a reconnect delivers it again.
 *  - A TTS failure never loses the underlying transaction — the caller
 *    already has it (from the backend), this queue only tracks whether IT
 *    was announced, and exposes retry() for the failed one.
 *  - Announcements are processed one at a time (a FIFO queue) so two
 *    events arriving back-to-back don't talk over each other.
 */
export class AnnouncementQueue {
  private readonly announced = new Set<string>();
  private readonly formatter = new PaymentNotificationFormatter();
  private queue: Promise<void> = Promise.resolve();
  private lastFailed: { transaction: FormattableTransaction & { transactionId: string } } | null = null;

  constructor(
    private readonly ttsEngine: TtsEngine,
    private readonly getSettings: () => AnnouncementSettings
  ) {}

  /** Enqueues an announcement; resolves once it has been attempted (spoken, skipped, or failed). */
  announce(tx: FormattableTransaction & { transactionId: string }): Promise<AnnouncementResult> {
    const run = () => this.doAnnounce(tx);
    const resultPromise = this.queue.then(run, run);
    // Keep the internal chain alive regardless of outcome, and never let a
    // rejection break future announcements.
    this.queue = resultPromise.then(
      () => undefined,
      () => undefined
    );
    return resultPromise;
  }

  /** Re-attempts the most recently failed announcement, if any. */
  retryLastFailed(): Promise<AnnouncementResult | null> {
    if (!this.lastFailed) return Promise.resolve(null);
    const tx = this.lastFailed.transaction;
    this.lastFailed = null;
    return this.announce(tx);
  }

  hasAnnounced(transactionId: string): boolean {
    return this.announced.has(transactionId);
  }

  private async doAnnounce(
    tx: FormattableTransaction & { transactionId: string }
  ): Promise<AnnouncementResult> {
    if (this.announced.has(tx.transactionId)) {
      return { status: 'skipped_duplicate', transactionId: tx.transactionId };
    }

    const text = this.formatter.format(tx);
    const settings = this.getSettings();

    try {
      await this.ttsEngine.speak(text, settings);
      this.announced.add(tx.transactionId);
      return { status: 'spoken', transactionId: tx.transactionId, text };
    } catch (err) {
      this.lastFailed = { transaction: tx };
      return {
        status: 'failed',
        transactionId: tx.transactionId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
