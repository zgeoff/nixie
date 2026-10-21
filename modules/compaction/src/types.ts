import type { Log } from '@heynixie/log';

export interface CompactionSettings {
  readonly threshold: number;

  readonly headsUp: number;

  readonly summaryTokens: number;
}

export interface ContextSize {
  readonly size: number;
  readonly window: number;
}

export interface LogContext {
  readonly log: Log;
}
