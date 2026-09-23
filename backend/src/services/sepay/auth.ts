import { timingSafeEqual } from 'node:crypto';

/**
 * Verifies the SePay webhook `Authorization: Apikey <key>` header against
 * the configured secret, using a constant-time comparison to avoid timing
 * side-channels. Never logs the header or the configured key.
 */
export function verifySepayApiKey(authorizationHeader: string | undefined, expectedApiKey: string): boolean {
  if (!authorizationHeader) return false;

  const match = /^Apikey\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;

  const provided = match[1];
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expectedApiKey);

  if (providedBuf.length !== expectedBuf.length) {
    // Still do a comparison of equal-length buffers to keep timing roughly
    // constant regardless of length mismatch, then return false.
    timingSafeEqual(providedBuf, providedBuf);
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}
