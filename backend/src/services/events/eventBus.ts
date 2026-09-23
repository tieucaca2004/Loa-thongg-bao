import { EventEmitter } from 'node:events';

/** The single payment event this system emits. See docs/ARCHITECTURE.md #6. */
export interface PaymentReceivedEvent {
  type: 'PAYMENT_RECEIVED';
  transactionId: string;
  amount: number;
  content: string | null;
  transactionDate: string | null;
  referenceCode: string | null;
  provider: string;
}

/**
 * In-process event bus. The webhook handler publishes here; a separate
 * transport (WebSocket server) subscribes and forwards to desktop clients.
 * Kept as a small wrapper (not raw EventEmitter) so publish/subscribe is
 * typed and the transport can be swapped later without touching callers.
 */
export class PaymentEventBus {
  private readonly emitter = new EventEmitter();
  private static readonly EVENT_NAME = 'payment_received';

  /**
   * Publishes to every subscriber. Each subscriber is invoked in isolation:
   * one throwing (e.g. a broken WebSocket broadcast loop) must never
   * prevent other subscribers from running, and must never propagate back
   * to the webhook handler — the transaction was already persisted before
   * publish() is called, so a subscriber failure here must not turn an
   * already-successful write into a false 500 (Phase 9 hardening; see
   * src/__tests__/eventBusResilience.test.ts for the reproduction).
   */
  publish(event: PaymentReceivedEvent): void {
    for (const listener of this.emitter.listeners(PaymentEventBus.EVENT_NAME)) {
      try {
        (listener as (e: PaymentReceivedEvent) => void)(event);
      } catch {
        // Intentionally swallowed: a subscriber's failure to consume the
        // event must not affect transaction integrity or other subscribers.
        // The transaction itself is already durably persisted by this point.
      }
    }
  }

  subscribe(listener: (event: PaymentReceivedEvent) => void): () => void {
    this.emitter.on(PaymentEventBus.EVENT_NAME, listener);
    return () => this.emitter.off(PaymentEventBus.EVENT_NAME, listener);
  }
}
