import { describe, expect, it } from 'vitest';
import { PaymentNotificationFormatter } from '../formatter/PaymentNotificationFormatter.js';

describe('PaymentNotificationFormatter', () => {
  const formatter = new PaymentNotificationFormatter();

  it('formats amount without content', () => {
    expect(formatter.format({ amount: 100000, content: null })).toBe('Đã nhận một trăm nghìn đồng.');
  });

  it('formats amount with content appended', () => {
    expect(formatter.format({ amount: 200000, content: 'ATIEU 1234' })).toBe(
      'Đã nhận hai trăm nghìn đồng. Nội dung chuyển khoản ATIEU 1234.'
    );
  });

  it('treats blank content the same as no content', () => {
    expect(formatter.format({ amount: 50000, content: '   ' })).toBe('Đã nhận năm mươi nghìn đồng.');
  });

  it('formats large amounts', () => {
    expect(formatter.format({ amount: 15000000, content: null })).toBe(
      'Đã nhận mười lăm triệu đồng.'
    );
  });
});
