import type { NewTransaction } from '../../models/transaction.js';
import type { SepayWebhookPayload } from './schema.js';

/**
 * Maps a validated SePay webhook payload into our normalized Transaction
 * model. This is the ONE place that knows about SePay's field names, so a
 * documentation correction only needs to change this function.
 */
export function normalizeSepayPayload(payload: SepayWebhookPayload, rawBody: unknown): NewTransaction {
  return {
    provider: 'sepay',
    gateway: payload.gateway,
    transactionId: String(payload.id),
    referenceCode: payload.referenceCode ?? payload.code ?? null,
    accountNumber: payload.accountNumber ?? payload.subAccount ?? null,
    amount: Math.trunc(Number(payload.transferAmount)),
    transactionType: payload.transferType,
    content: payload.content ?? payload.description ?? null,
    transactionDate: payload.transactionDate ?? null,
    rawPayload: JSON.stringify(rawBody),
  };
}
