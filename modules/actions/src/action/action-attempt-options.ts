import type { ActionConnector } from '@heynixie/connectors';
import type { AttemptCheck } from './attempt-check';

export interface ActionAttemptOptions {
  readonly connectors: ReadonlyMap<string, ActionConnector>;
  readonly leaseMs: number;

  // Decides the action again before each attempt. With none, every attempt goes ahead.
  readonly checkAttempt?: AttemptCheck;

  // The tool name prefixes whose actions wait, read again when an attempt starts.
  readonly readHeldToolPrefixes?: () => readonly string[];
}
