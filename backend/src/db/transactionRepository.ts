import { randomUUID } from 'node:crypto';
import type { DbHandle } from './index.js';
import type { NewTransaction, Transaction, TransactionRow } from '../models/transaction.js';
import { rowToTransaction } from '../models/transaction.js';

/**
 * Result of attempting to insert a transaction.
 * `duplicate: true` means the transaction already existed (idempotent no-op)
 * and no new row / event should be produced.
 */
export interface InsertResult {
  transaction: Transaction;
  duplicate: boolean;
}

export class TransactionRepository {
  constructor(private readonly db: DbHandle) {}

  /**
   * Inserts a transaction if `transactionId` hasn't been seen before.
   * Uses SQLite's UNIQUE constraint + INSERT OR IGNORE so concurrent /
   * repeated webhook deliveries can never create two rows for the same
   * provider transaction id (this is the idempotency guarantee).
   */
  insertIfNew(input: NewTransaction): InsertResult {
    const now = new Date().toISOString();
    const id = randomUUID();

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO transactions (
        id, provider, gateway, transaction_id, reference_code, account_number,
        amount, transaction_type, content, transaction_date, received_at,
        status, raw_payload, created_at, updated_at
      ) VALUES (
        @id, @provider, @gateway, @transactionId, @referenceCode, @accountNumber,
        @amount, @transactionType, @content, @transactionDate, @receivedAt,
        'received', @rawPayload, @createdAt, @updatedAt
      )
    `);

    const result = insert.run({
      id,
      provider: input.provider,
      gateway: input.gateway,
      transactionId: input.transactionId,
      referenceCode: input.referenceCode,
      accountNumber: input.accountNumber,
      amount: input.amount,
      transactionType: input.transactionType,
      content: input.content,
      transactionDate: input.transactionDate,
      receivedAt: now,
      rawPayload: input.rawPayload,
      createdAt: now,
      updatedAt: now,
    });

    const existing = this.getByTransactionId(input.transactionId);
    if (!existing) {
      // Should be unreachable: we just inserted or it already existed.
      throw new Error('Failed to read back transaction after insert');
    }

    return { transaction: existing, duplicate: result.changes === 0 };
  }

  getByTransactionId(transactionId: string): Transaction | null {
    const row = this.db
      .prepare('SELECT * FROM transactions WHERE transaction_id = ?')
      .get(transactionId) as TransactionRow | undefined;
    return row ? rowToTransaction(row) : null;
  }

  getById(id: string): Transaction | null {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as
      | TransactionRow
      | undefined;
    return row ? rowToTransaction(row) : null;
  }

  listRecent(limit = 50): Transaction[] {
    const rows = this.db
      .prepare('SELECT * FROM transactions ORDER BY received_at DESC LIMIT ?')
      .all(limit) as TransactionRow[];
    return rows.map(rowToTransaction);
  }

  markStatus(id: string, status: Transaction['status']): void {
    this.db
      .prepare('UPDATE transactions SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number };
    return row.c;
  }
}

export interface WebhookLogEntry {
  outcome: 'accepted' | 'duplicate' | 'rejected_invalid' | 'rejected_auth';
  reason?: string | null;
  transactionId?: string | null;
  rawPayload: string;
  sourceIp?: string | null;
}

export class WebhookLogRepository {
  constructor(private readonly db: DbHandle) {}

  log(entry: WebhookLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO webhook_logs (id, received_at, outcome, reason, transaction_id, raw_payload, source_ip)
         VALUES (@id, @receivedAt, @outcome, @reason, @transactionId, @rawPayload, @sourceIp)`
      )
      .run({
        id: randomUUID(),
        receivedAt: new Date().toISOString(),
        outcome: entry.outcome,
        reason: entry.reason ?? null,
        transactionId: entry.transactionId ?? null,
        rawPayload: entry.rawPayload,
        sourceIp: entry.sourceIp ?? null,
      });
  }
}
