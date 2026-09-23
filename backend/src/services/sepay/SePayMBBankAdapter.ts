import type { NewTransaction } from '../../models/transaction.js';
import { validateSepayPayload } from './schema.js';
import { normalizeSepayPayload } from './normalize.js';
import { verifySepayApiKey } from './auth.js';

export type ParseWebhookResult =
  | { ok: true; transaction: NewTransaction }
  | { ok: false; reason: string };

/**
 * Single adapter boundary for the SePay-webhook-for-MBBank integration
 * (Phase 10.2, production readiness prep).
 *
 * This is a thin facade over the existing, already-isolated pieces
 * (schema.ts validation, normalize.ts field mapping, auth.ts header
 * verification) — none of their internal logic changed in this phase; the
 * frozen Phase 1-8/9 webhook behavior is unchanged and still covered by the
 * same passing tests. What's new is a single named boundary so the rest of
 * the Payment Engine only ever depends on this class, never on SePay- or
 * MBBank-specific field names directly.
 *
 *   MBBank / SePay → SePayMBBankAdapter → NormalizedTransaction → Payment Engine
 *
 * Responsibilities:
 *  - account configuration: the adapter is constructed with the webhook API
 *    key for this account (from SEPAY_WEBHOOK_API_KEY); it does not read
 *    environment variables itself, so it stays testable and so a future
 *    multi-account setup can construct one adapter per account.
 *  - webhook normalization + provider-specific field mapping: parseWebhook()
 *    validates the raw SePay payload shape and maps it into our
 *    NormalizedTransaction (NewTransaction) model. This is the ONLY place
 *    that knows SePay's field names (id, transferAmount, transferType, ...).
 *  - provider-specific error handling: parseWebhook() never throws for a
 *    malformed/invalid payload — it returns a typed { ok: false, reason }
 *    result, so the rest of the pipeline handles "invalid webhook" as
 *    ordinary control flow, not exceptions.
 *  - transaction retrieval: not applicable for this integration. SePay's
 *    bank-webhook product is push-only (SePay calls our webhook when a
 *    transaction happens); there is no "pull the transaction list" API in
 *    this flow, so no retrieval method is implemented. (SePay also offers a
 *    separate "Payment Gateway" product with its own Basic-Auth API — that
 *    is a different product/credential set, out of scope here; see
 *    docs/TECHNICAL_NOTES.md.)
 */
export class SePayMBBankAdapter {
  constructor(private readonly webhookApiKey: string) {}

  /** Verifies the `Authorization: Apikey <key>` header for this account. */
  verifyWebhookAuth(authorizationHeader: string | undefined): boolean {
    return verifySepayApiKey(authorizationHeader, this.webhookApiKey);
  }

  /**
   * Validates and normalizes a raw webhook body. Never throws for bad
   * input — returns a typed failure instead, per "provider-specific error
   * handling" above.
   */
  parseWebhook(rawBody: unknown): ParseWebhookResult {
    const validation = validateSepayPayload(rawBody);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }
    return { ok: true, transaction: normalizeSepayPayload(validation.payload, rawBody) };
  }
}
