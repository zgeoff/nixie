import type { CompactionRequest } from '@heynixie/compaction';
import type { SessionPoint } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import { renderSystemPrompt } from './render-system-prompt';
import type { SessionStep } from './types';

export interface CompactionCause {
  readonly resume: SessionPoint;
  readonly trigger: CompactionRequest['trigger'];
  readonly contextSize: number | null;
}

export function buildCompactionRequest(
  step: SessionStep,
  cause: CompactionCause,
): CompactionRequest {
  const run = step.run;

  const now = new Date(run.context.clock.now());

  const ownerName = run.memorySettings.ownerName;

  return {
    taskID: step.input.taskID,
    resume: cause.resume,
    trigger: cause.trigger,
    contextSize: cause.contextSize,
    failures: step.marks.compactionFailures,
    signal: step.signal,
    systemPrompt: renderSystemPrompt(step.definitions.persona, step.skillCatalog, { ownerName }),
    at: formatMessageTime(now, null, { defaultZone: run.defaultZone, now }),
    ownerName,
  };
}
