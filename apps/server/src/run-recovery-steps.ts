import { writeUnknownOutcomes } from '@heynixie/actions';
import { memoryWriterTaskID } from '@heynixie/memory';
import { checkerOwner } from '@heynixie/models';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { conversationTaskID, runRecovery } from '@heynixie/tasks';
import type { ServerParts } from './types';
import { writeStartRecord } from './write-start-record';

// Recovery, before any runner starts, under this process's new writer epoch, then the record of
// this start. Its sandbox cleanup keeps the conversation's and the memory writer's sandboxes, whose
// tasks never end, and the checker's, which the deployment owns.
export async function runRecoverySteps(parts: ServerParts): Promise<void> {
  await runRecovery(parts.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(parts.context),
    sandboxes: {
      removeStaleSandboxes: () =>
        removeStaleSandboxes({
          log: parts.context.log,
          adapter: parts.tools.adapter,
          keptOwners: [conversationTaskID, memoryWriterTaskID, checkerOwner],
        }),
    },
  });
  await writeStartRecord(parts.context);
}
