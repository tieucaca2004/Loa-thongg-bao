import { describe, expect, it } from 'vitest';
import { SePayMBBankAdapter } from '../services/sepay/SePayMBBankAdapter.js';

const KEY = 'adapter-test-key';

describe('SePayMBBankAdapter (Phase 10.2)', () => {
  const adapter = new SePayMBBankAdapter(KEY);

  it('verifies a correct Authorization header', () => {
    expect(adapter.verifyWebhookAuth(`Apikey ${KEY}`)).toBe(true);
  });

  it('rejects a wrong or missing Authorization header', () => {
    expect(adapter.verifyWebhookAuth('Apikey wrong')).toBe(false);
    expect(adapter.verifyWebhookAuth(undefined)).toBe(false);
  });

  it('parses a valid webhook body into a normalized transaction', () => {
    const result = adapter.parseWebhook({
      id: 'adapter-tx-1',
      gateway: 'MBBank',
      transferType: 'in',
      transferAmount: 50000,
      content: 'ATIEU 1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.transactionId).toBe('adapter-tx-1');
      expect(result.transaction.amount).toBe(50000);
      expect(result.transaction.gateway).toBe('MBBank');
    }
  });

  it('returns a typed failure (never throws) for an invalid webhook body', () => {
    expect(() => adapter.parseWebhook({ not: 'a valid payload' })).not.toThrow();
    const result = adapter.parseWebhook({ not: 'a valid payload' });
    expect(result.ok).toBe(false);
  });
});
