import type { Log } from '@heynixie/log';

// When nixie compacts a session, each setting tunable from the deployment configuration.
export interface CompactionSettings {
  // the share of the profile's window at or past which a turn's end compacts the session
  readonly threshold: number;

  // the token cap of the summary the model writes, which its word target derives from
  readonly summaryTokens: number;
}

// The context a model turn ended with: the tokens its last call read, and the window it ran in.
export interface ContextSize {
  readonly size: number;
  readonly window: number;
}

// Any context that holds the event log, such as a task's.
export interface LogContext {
  readonly log: Log;
}
