import { writeUnknownOutcomes } from '@heynixie/actions';
import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import { conversationTaskID, runRecovery } from '@heynixie/tasks';
import type { ServerParts } from './types';

// Recovery, before any runner starts, under this process's new writer epoch. Its sandbox cleanup keeps the sandboxes of the conversation, the memory writer and
// the memory consolidator, whose tasks never end, and the checker's, which the deployment owns.
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
