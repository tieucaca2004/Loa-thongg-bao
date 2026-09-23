export type TransactionType = 'in' | 'out';
export type TransactionStatus = 'received' | 'announced' | 'error';

/** The normalized transaction model, per docs/ARCHITECTURE.md #5. */
export interface Transaction {
  id: string;
  provider: string;
  gateway: string;
  transactionId: string;
  referenceCode: string | null;
  accountNumber: string | null;
  amount: number;
  transactionType: TransactionType;
  content: string | null;
  transactionDate: string | null;
  receivedAt: string;
  status: TransactionStatus;
  rawPayload: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields required to insert a new transaction (id/timestamps assigned by the repo). */
export interface NewTransaction {
  provider: string;
  gateway: string;
  transactionId: string;
  referenceCode: string | null;
  accountNumber: string | null;
  amount: number;
  transactionType: TransactionType;
  content: string | null;
  transactionDate: string | null;
  rawPayload: string;
}

export interface TransactionRow {
  id: string;
  provider: string;
  gateway: string;
  transaction_id: string;
  reference_code: string | null;
  account_number: string | null;
  amount: number;
  transaction_type: string;
  content: string | null;
  transaction_date: string | null;
  received_at: string;
  status: string;
  raw_payload: string;
  created_at: string;
  updated_at: string;
}

export function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    provider: row.provider,
    gateway: row.gateway,
    transactionId: row.transaction_id,
    referenceCode: row.reference_code,
    accountNumber: row.account_number,
    amount: row.amount,
    transactionType: row.transaction_type as TransactionType,
    content: row.content,
    transactionDate: row.transaction_date,
    receivedAt: row.received_at,
    status: row.status as TransactionStatus,
    rawPayload: row.raw_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
