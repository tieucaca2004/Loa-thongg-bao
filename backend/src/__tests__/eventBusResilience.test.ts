import { describe, expect, it } from 'vitest';
import { PaymentEventBus } from '../services/events/eventBus.js';

describe('PaymentEventBus resilience (Phase 9 evidence)', () => {
  it('publish() does not throw even if a subscriber listener throws', () => {
    const bus = new PaymentEventBus();
    bus.subscribe(() => {
      throw new Error('desktop websocket subscriber blew up');
    });

    // Node's EventEmitter re-throws synchronously from emit() by default
    // when a listener throws. If publish() doesn't guard against that, a
    // broken subscriber (e.g. the WS broadcast loop) would make the
    // webhook handler see an exception AFTER the transaction was already
    // persisted, risking a false 500 for an already-successful write.
    expect(() =>
      bus.publish({
        type: 'PAYMENT_RECEIVED',
        transactionId: 'evidence-1',
        amount: 1000,
        content: null,
        transactionDate: null,
        referenceCode: null,
        provider: 'sepay',
      })
    ).not.toThrow();
  });

  it('a throwing subscriber does not prevent other subscribers from receiving the event', () => {
    const bus = new PaymentEventBus();
    let secondCalled = false;
    bus.subscribe(() => {
      throw new Error('first subscriber fails');
    });
    bus.subscribe(() => {
      secondCalled = true;
    });

    bus.publish({
      type: 'PAYMENT_RECEIVED',
      transactionId: 'evidence-2',
      amount: 1000,
      content: null,
      transactionDate: null,
      referenceCode: null,
      provider: 'sepay',
    });

    expect(secondCalled).toBe(true);
  });
});
