import type { CompactionRequest } from '@heynixie/compaction';
import type { SessionPoint } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import { renderSessionPrompt } from './render-session-prompt';
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
    systemPrompt: renderSessionPrompt(run.frame, {
      taskID: step.input.taskID,
      persona: step.definitions.persona,
      skillCatalog: step.skillCatalog,
      ownerName,
      messaging: run.messaging,
      prompts: step.definitions.prompts,
    }),
    at: formatMessageTime(now, null, { defaultZone: run.defaultZone, now }),
    ownerName,
    prompts: step.definitions.prompts,
  };
}
