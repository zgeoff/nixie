import type { ConnectorLookup } from '@heynixie/connectors';
import type { AdmitTool } from '../types';
import type { AttemptCheck } from './attempt-check';

export interface ActionAttemptOptions {
  readonly connectors: ConnectorLookup;
  readonly leaseMs: number;

  // Decides the action again before each attempt. With none, every attempt goes ahead.
  readonly checkAttempt?: AttemptCheck;

  // The tool name prefixes whose actions wait, read again when an attempt starts.
  readonly readHeldToolPrefixes?: () => readonly string[];

  // admits each attempt's call past a hold, as the start's transaction ends
  readonly admitTool?: AdmitTool;
}
