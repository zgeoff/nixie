import { writeUnknownOutcomes } from '@heynixie/actions';
import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import { conversationTaskID, runRecovery } from '@heynixie/tasks';
import type { ServerParts } from './types';

export async function runRecoverySteps(parts: ServerParts): Promise<void> {
  await runRecovery(parts.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(parts.context),
    sandboxes: {
      removeStaleSandboxes: () =>
        removeStaleSandboxes({
          log: parts.context.log,
          adapter: parts.tools.adapter,
          keptOwners: [
            conversationTaskID,
            memoryWriterTaskID,
            memoryConsolidatorTaskID,
            checkerOwner,
          ],
        }),
    },
  });
}
