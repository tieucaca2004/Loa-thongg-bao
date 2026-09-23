import { numberToVietnameseWords } from './vietnameseNumber.js';

/** Minimal shape the formatter needs from a PAYMENT_RECEIVED event. */
export interface FormattableTransaction {
  amount: number;
  content: string | null;
}

/**
 * Turns a transaction into the spoken Vietnamese announcement text.
 *
 * Kept as its own class/module (per project spec #9) so the wording can
 * change later (e.g. add merchant name, change phrasing) without touching
 * any payment-engine or TTS-engine code — only this formatter.
 */
export class PaymentNotificationFormatter {
  format(tx: FormattableTransaction): string {
    const amountWords = numberToVietnameseWords(tx.amount);
    const base = `Đã nhận ${amountWords} đồng.`;
    if (tx.content && tx.content.trim().length > 0) {
      return `${base} Nội dung chuyển khoản ${tx.content.trim()}.`;
    }
    return base;
  }
}
