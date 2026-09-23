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

  publish(event: PaymentReceivedEvent): void {
    this.emitter.emit(PaymentEventBus.EVENT_NAME, event);
  }

  subscribe(listener: (event: PaymentReceivedEvent) => void): () => void {
    this.emitter.on(PaymentEventBus.EVENT_NAME, listener);
    return () => this.emitter.off(PaymentEventBus.EVENT_NAME, listener);
  }
}
