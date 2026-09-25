import type { TransactionRepository, WebhookLogRepository } from '../../db/transactionRepository.js';
import type { PaymentEventBus } from '../events/eventBus.js';
import type { SePayMBBankAdapter } from '../sepay/SePayMBBankAdapter.js';
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
  /** The single boundary that knows SePay/MBBank-specific field names (Phase 10.2). */
  adapter: SePayMBBankAdapter;
}

/**
 * Full webhook pipeline: validate -> normalize -> idempotency check ->
 * persist -> publish event (incoming "in" transactions only; "out" is
 * persisted but never published). Kept independent of the HTTP framework so it's
 * easy to unit test.
 *
 * Never calls TTS/desktop directly — only publishes an in-process event
 * (see docs/ARCHITECTURE.md). Never touches SePay/MBBank field names
 * directly — that's isolated behind `adapter` (see docs/ARCHITECTURE.md,
 * "MBBank adapter").
 */
export function processSepayWebhook(rawBody: unknown, deps: WebhookProcessorDeps): WebhookOutcome {
  const { transactions, webhookLogs, events, log, adapter } = deps;

  const parsed = adapter.parseWebhook(rawBody);
  if (!parsed.ok) {
    webhookLogs.log({
      outcome: 'rejected_invalid',
      reason: parsed.reason,
      rawPayload: safeStringify(rawBody),
    });
    log.warn({ reason: parsed.reason }, 'rejected invalid sepay webhook payload');
    return { status: 'rejected', httpStatus: 400, reason: parsed.reason };
  }

  const { transaction, duplicate } = transactions.insertIfNew(parsed.transaction);

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
    {
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      gateway: transaction.gateway,
      transactionType: transaction.transactionType,
    },
    'transaction persisted'
  );

  // Only incoming money is a "payment received". Outgoing transfers
  // (transferType "out") are still persisted above for audit, but must never
  // reach the desktop, which would otherwise announce them as "Đã nhận ...".
  if (transaction.transactionType !== 'in') {
    return { status: 'accepted', transactionId: transaction.transactionId, duplicate: false };
  }

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
