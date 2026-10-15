import type { SessionPoint } from '@heynixie/wire';
import type { CompactionRequest } from './run-session-compaction';
import type { SessionStep } from './types';

// What a step asks the compactor for: a summary of the session at the boundary, with what asked
// for it and the context the session held then.
export interface CompactionCause {
  readonly resume: SessionPoint;
  readonly trigger: CompactionRequest['trigger'];
  readonly contextSize: number | null;
}

// Builds the compaction request of a step, which counts its failure after those in a row before it.
export function buildCompactionRequest(
  step: SessionStep,
  cause: CompactionCause,
): CompactionRequest {
  return {
    taskID: step.input.taskID,
    resume: cause.resume,
    trigger: cause.trigger,
    contextSize: cause.contextSize,
    failures: step.marks.compactionFailures,
    signal: step.signal,
  };
}
