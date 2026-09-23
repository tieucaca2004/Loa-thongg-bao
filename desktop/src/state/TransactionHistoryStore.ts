import type { PaymentReceivedEvent } from '../connection/BackendClient.js';

export interface HistoryEntry extends PaymentReceivedEvent {
  receivedAt: string;
  announced: boolean;
}

/** Keeps the most recent transactions shown in the desktop UI (project spec #7). */
export class TransactionHistoryStore {
  private entries: HistoryEntry[] = [];

  constructor(private readonly maxEntries = 50) {}

  add(event: PaymentReceivedEvent): HistoryEntry {
    const entry: HistoryEntry = { ...event, receivedAt: new Date().toISOString(), announced: false };
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
    return entry;
  }

  markAnnounced(transactionId: string): void {
    const entry = this.entries.find((e) => e.transactionId === transactionId);
    if (entry) entry.announced = true;
  }

  list(): readonly HistoryEntry[] {
    return this.entries;
  }
}
