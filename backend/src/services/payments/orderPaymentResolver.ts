import type { Transaction } from '../../models/transaction.js';

/**
 * Extension point for a future integration with the A Tieu Order system.
 *
 * V1 deliberately does NOT implement or call this — Payment Engine V1 is
 * independent of Order A Tieu (see project rule #10). A future phase will
 * provide a concrete implementation that calls the Order API to resolve
 * which order a transaction pays for and mark it PAID.
 */
export interface OrderPaymentResolver {
  /**
   * Given a persisted transaction, attempt to resolve the order it pays
   * for (e.g. by parsing `content` for an order code) and return an order
   * identifier, or null if no order could be matched.
   */
  resolveOrderForTransaction(transaction: Transaction): Promise<string | null>;
}

/** No-op resolver used until the Order integration exists. */
export class NullOrderPaymentResolver implements OrderPaymentResolver {
  async resolveOrderForTransaction(_transaction: Transaction): Promise<string | null> {
    return null;
  }
}
