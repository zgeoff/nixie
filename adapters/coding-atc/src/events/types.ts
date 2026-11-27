import type { SessionState } from '@heynixie/coding';
import type { Logger } from '@heynixie/logger';
import type { ATCFleet } from '../call/connect-atc';

// What the adapter last mapped for a session, and when it read it.
export interface KnownSession {
  state: SessionState;
  readAtMs: number;
}

export interface EventsDependencies {
  readonly atc: ATCFleet;
  readonly known: Map<string, KnownSession>;
  readonly log: Logger;
  readonly now: () => number;

  // the longest the stream waits before it reads the bound sessions again
  readonly waitMs: number;

  // how often a session that has not ended gets a state read
  readonly stateReadMs: number;
}
