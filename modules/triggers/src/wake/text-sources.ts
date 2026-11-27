import type { Log } from '@heynixie/log';

export interface StoredTextFields {
  readonly from: string;
  readonly body: string;
}

// The part of a log that reads one transaction's view of the records.
export type TransactionLog = Pick<Log, 'deploymentKey' | 'writer'>;

// A feature's source of texts, as the core knows it.
export interface TextSource {
  readonly sourceID: string;

  // The sender and body that the feature still holds for a text, or null once its forget has begun.
  // The core reads it in the transaction that writes an arrival or a wake, with a log whose database
  // handle is that transaction.
  readonly readFields: (log: TransactionLog, messageID: string) => Promise<StoredTextFields | null>;
}

let current: readonly TextSource[] = [];

// The text sources that features fill. The server sets the list at the start of each server, before
// any part starts, and a feature that is off adds none.
export const textSources = {
  set: (next: readonly TextSource[]): void => {
    current = next;
  },
  list: (): readonly string[] => current.map((source) => source.sourceID),
  findSource: (sourceID: string): TextSource | null =>
    current.find((source) => source.sourceID === sourceID) ?? null,
  has: (sourceID: string): boolean => current.some((source) => source.sourceID === sourceID),
};
