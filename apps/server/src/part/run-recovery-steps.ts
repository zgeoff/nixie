import { writeUnknownOutcomes } from '@heynixie/actions';
import { conversationTaskID, runRecovery } from '@heynixie/tasks';
import type { ServerParts } from '../types';
import { removeRecoveredSandboxes } from './remove-recovered-sandboxes';

export async function runRecoverySteps(parts: ServerParts): Promise<void> {
  await runRecovery(parts.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(parts.context, parts.tools.actions.connectors),
    sandboxes: {
      removeStaleSandboxes: () =>
        removeRecoveredSandboxes(parts.context, {
          logger: parts.log,
          adapter: parts.tools.adapter,
          currentImages: Object.values(parts.images).map((image) => image.name),

          // The conversation's own setup replaces its old-image sandbox after it copies the session out.
          imageExemptOwners: [conversationTaskID],
        }),
    },
  });
}
