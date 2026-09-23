#!/usr/bin/env node
/**
 * Sends a simulated SePay MBBank webhook to a locally running backend.
 * Stands in for SePay's own Test Mode "simulate transaction" button until
 * the dashboard is reachable from this environment (see docs/SEPAY.md).
 *
 * Usage:
 *   node scripts/simulate-webhook.mjs [--amount 100000] [--content "ATIEU 1234"] \
 *     [--id <transactionId>] [--repeat 1] [--url http://localhost:3000/webhooks/sepay] \
 *     [--api-key <key>]
 *
 * Reads SEPAY_WEBHOOK_API_KEY from the environment if --api-key is omitted.
 */

function parseArgs(argv) {
  const args = { amount: 100000, content: 'ATIEU 1234', repeat: 1, url: 'http://localhost:3000/webhooks/sepay' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    args[name] = value;
    i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const apiKey = args['api-key'] || process.env.SEPAY_WEBHOOK_API_KEY;
if (!apiKey) {
  console.error('Missing API key. Pass --api-key <key> or set SEPAY_WEBHOOK_API_KEY.');
  process.exit(1);
}

const transactionId = args.id || `sim-${Date.now()}`;
const repeat = Number(args.repeat) || 1;

const payload = {
  id: transactionId,
  gateway: 'MBBank',
  transactionDate: new Date().toISOString().replace('T', ' ').slice(0, 19),
  accountNumber: '0123456789',
  code: null,
  content: args.content,
  transferType: 'in',
  transferAmount: Number(args.amount),
  referenceCode: `FT-SIM-${transactionId}`,
};

console.log(`Sending ${repeat}x simulated webhook for transaction "${transactionId}" (${args.amount} VND)...`);

for (let i = 0; i < repeat; i++) {
  const res = await fetch(args.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  console.log(`[${i + 1}/${repeat}] HTTP ${res.status} —`, body);
}
