import type { CompactionRequest } from '@heynixie/compaction';
import { renderPrompt } from '@heynixie/prompts';
import type { SessionPoint } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
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
    systemPrompt: renderPrompt(
      'session',
      {
        persona: step.definitions.persona,
        skillCatalog: step.skillCatalog,
        owner: { name: ownerName },
      },
      step.definitions.prompts,
    ),
    at: formatMessageTime(now, null, { defaultZone: run.defaultZone, now }),
    ownerName,
    prompts: step.definitions.prompts,
  };
}
