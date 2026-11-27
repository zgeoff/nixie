import type { Definitions, Log } from '@heynixie/log';

export interface PlaceContext {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // Publishes a definitions snapshot that holds the directory as it is now, because a call decides
  // under the snapshot it started with. A write is in force for the next call only once it runs.
  readonly publishSnapshot: () => Promise<void>;
}
