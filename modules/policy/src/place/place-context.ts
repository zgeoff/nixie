import type { Definitions, Log, WriteTransaction } from '@heynixie/log';

export interface PlaceContext {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // Puts a definitions snapshot that holds the directory in force, in the transaction of the write
  // that changed it, because a call decides under the snapshot it started with. It throws when the
  // seed refuses, which rolls the write back, so a write is in force for the next call or not made.
  readonly runInForce: (tx: WriteTransaction) => Promise<void>;
}
