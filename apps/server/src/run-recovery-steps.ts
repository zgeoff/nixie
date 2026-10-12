import { writeUnknownOutcomes } from '@heynixie/actions';
import { memoryWriterTaskID } from '@heynixie/memory';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { conversationTaskID, runRecovery } from '@heynixie/tasks';
import type { ServerParts } from './types';

// Recovery, before any runner starts, under this process's new writer epoch. Its sandbox cleanup
// keeps the conversation's sandbox and the memory writer's, whose tasks never end.
export function runRecoverySteps(parts: ServerParts): Promise<void> {
  return runRecovery(parts.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(parts.context),
    sandboxes: {
      removeStaleSandboxes: () =>
        removeStaleSandboxes({
          log: parts.context.log,
          adapter: parts.tools.adapter,
          keptOwners: [conversationTaskID, memoryWriterTaskID],
        }),
    },
  });
}
