import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.js';
import { TransactionRepository } from '../db/transactionRepository.js';
import type { NewTransaction } from '../models/transaction.js';

function sampleTx(overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    provider: 'sepay',
    gateway: 'MBBank',
    transactionId: 'tx-1',
    referenceCode: 'REF-1',
    accountNumber: '0123456789',
    amount: 100000,
    transactionType: 'in',
    content: 'ATIEU 1',
    transactionDate: '2026-09-23 10:00:00',
    rawPayload: '{}',
    ...overrides,
  };
}

describe('TransactionRepository idempotency', () => {
  it('creates exactly one row when the same transaction id is inserted repeatedly', () => {
    const db = openDatabase(':memory:');
    const repo = new TransactionRepository(db);

    for (let i = 0; i < 10; i++) {
      repo.insertIfNew(sampleTx());
    }

    expect(repo.count()).toBe(1);
    db.close();
  });

  it('reports duplicate=true from the second insert onward', () => {
    const db = openDatabase(':memory:');
    const repo = new TransactionRepository(db);

    const first = repo.insertIfNew(sampleTx());
    const second = repo.insertIfNew(sampleTx());

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.transaction.id).toBe(first.transaction.id);
    db.close();
  });

  it('allows two different transaction ids to both be stored', () => {
    const db = openDatabase(':memory:');
    const repo = new TransactionRepository(db);

    repo.insertIfNew(sampleTx({ transactionId: 'tx-a' }));
    repo.insertIfNew(sampleTx({ transactionId: 'tx-b' }));

    expect(repo.count()).toBe(2);
    db.close();
  });

  it('survives a simulated restart: reopening the same file preserves history', () => {
    const path = `/tmp/atieu-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
    const db1 = openDatabase(path);
    new TransactionRepository(db1).insertIfNew(sampleTx({ transactionId: 'tx-restart' }));
    db1.close();

    const db2 = openDatabase(path);
    const repo2 = new TransactionRepository(db2);
    expect(repo2.getByTransactionId('tx-restart')).not.toBeNull();
    db2.close();
  });
});
