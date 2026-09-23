import { z } from 'zod';

/**
 * Validation schema for the SePay webhook payload.
 *
 * Per docs/TECHNICAL_NOTES.md, only the fields confirmed from SePay's
 * documentation are required/typed strictly; everything else is passed
 * through untouched in `raw_payload` for audit. We deliberately do NOT
 * guess at fields we couldn't verify.
 *
 * Field names as documented: id, gateway, transactionDate, accountNumber,
 * code, content, transferType ('in'|'out'), transferAmount, accumulated,
 * subAccount, referenceCode, description.
 */
export const sepayWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]),
  gateway: z.string().min(1),
  transactionDate: z.string().optional(),
  accountNumber: z.string().optional(),
  code: z.string().nullable().optional(),
  content: z.string().optional(),
  transferType: z.enum(['in', 'out']),
  transferAmount: z.union([z.number(), z.string()]),
  accumulated: z.union([z.number(), z.string()]).optional(),
  subAccount: z.string().nullable().optional(),
  referenceCode: z.string().nullable().optional(),
  description: z.string().optional(),
});

export type SepayWebhookPayload = z.infer<typeof sepayWebhookSchema>;

export interface ValidationFailure {
  ok: false;
  reason: string;
}
export interface ValidationSuccess {
  ok: true;
  payload: SepayWebhookPayload;
}

export function validateSepayPayload(body: unknown): ValidationSuccess | ValidationFailure {
  const result = sepayWebhookSchema.safeParse(body);
  if (!result.success) {
    return { ok: false, reason: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  const amount = Number(result.data.transferAmount);
  if (!Number.isFinite(amount)) {
    return { ok: false, reason: 'transferAmount is not a valid number' };
  }
  if (amount <= 0) {
    return { ok: false, reason: 'transferAmount must be a positive number' };
  }

  return { ok: true, payload: result.data };
}
