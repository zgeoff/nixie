import { writeUnknownOutcomes } from '@heynixie/actions';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import { conversationTaskID, readStartedTaskIDs, runRecovery } from '@heynixie/tasks';
import type { ServerParts } from '../types';

export async function runRecoverySteps(parts: ServerParts): Promise<void> {
  await runRecovery(parts.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(parts.context, parts.tools.actions.connectors),
    sandboxes: {
      removeStaleSandboxes: async () => {
        // A started task that waits keeps its imp, so its next step resumes the same session.
        const started = await readStartedTaskIDs(parts.context, { end: 'open' });

        await removeStaleSandboxes({
          log: parts.context.log,
          adapter: parts.tools.adapter,
          keptOwners: [conversationTaskID, checkerOwner, ...started],
        });
      },
    },
  });
}
