import type { TransactionRepository, WebhookLogRepository } from '../../db/transactionRepository.js';
import type { PaymentEventBus } from '../events/eventBus.js';
import { validateSepayPayload } from '../sepay/schema.js';
import { normalizeSepayPayload } from '../sepay/normalize.js';
import type { Logger } from '../../lib/logger.js';

export type WebhookOutcome =
  | { status: 'accepted'; transactionId: string; duplicate: false }
  | { status: 'accepted'; transactionId: string; duplicate: true }
  | { status: 'rejected'; httpStatus: number; reason: string };

export interface WebhookProcessorDeps {
  transactions: TransactionRepository;
  webhookLogs: WebhookLogRepository;
  events: PaymentEventBus;
  log: Logger;
}

/**
 * Full webhook pipeline: validate -> normalize -> idempotency check ->
 * persist -> publish event. Kept independent of the HTTP framework so it's
 * easy to unit test.
 *
 * Never calls TTS/desktop directly — only publishes an in-process event
 * (see docs/ARCHITECTURE.md).
 */
export function processSepayWebhook(rawBody: unknown, deps: WebhookProcessorDeps): WebhookOutcome {
  const { transactions, webhookLogs, events, log } = deps;

  const validation = validateSepayPayload(rawBody);
  if (!validation.ok) {
    webhookLogs.log({
      outcome: 'rejected_invalid',
      reason: validation.reason,
      rawPayload: safeStringify(rawBody),
    });
    log.warn({ reason: validation.reason }, 'rejected invalid sepay webhook payload');
    return { status: 'rejected', httpStatus: 400, reason: validation.reason };
  }

  const normalized = normalizeSepayPayload(validation.payload, rawBody);

  const { transaction, duplicate } = transactions.insertIfNew(normalized);

  webhookLogs.log({
    outcome: duplicate ? 'duplicate' : 'accepted',
    transactionId: transaction.transactionId,
    rawPayload: safeStringify(rawBody),
  });

  if (duplicate) {
    log.info({ transactionId: transaction.transactionId }, 'duplicate webhook ignored (idempotent)');
    return { status: 'accepted', transactionId: transaction.transactionId, duplicate: true };
  }

  log.info(
    { transactionId: transaction.transactionId, amount: transaction.amount, gateway: transaction.gateway },
    'transaction persisted'
  );

  events.publish({
    type: 'PAYMENT_RECEIVED',
    transactionId: transaction.transactionId,
    amount: transaction.amount,
    content: transaction.content,
    transactionDate: transaction.transactionDate,
    referenceCode: transaction.referenceCode,
    provider: transaction.provider,
  });

  return { status: 'accepted', transactionId: transaction.transactionId, duplicate: false };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"<unserializable payload>"';
  }
}
