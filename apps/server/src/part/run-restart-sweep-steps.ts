import { writeUnknownOutcomes } from '@heynixie/actions';
import { conversationTaskID, runRestartSweep } from '@heynixie/tasks';
import type { ServerParts } from '../types';
import { removeSweptSandboxes } from './remove-swept-sandboxes';

export async function runRestartSweepSteps(parts: ServerParts): Promise<void> {
  await runRestartSweep(parts.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(parts.context, parts.tools.actions.connectors),
    sandboxes: {
      removeStaleSandboxes: () =>
        removeSweptSandboxes(parts.context, {
          logger: parts.log,
          adapter: parts.tools.adapter,
          currentImages: Object.values(parts.images).map((image) => image.name),

          // The conversation's own setup replaces its old-image sandbox after it copies the session out.
          imageExemptOwners: [conversationTaskID],
        }),
    },
  });
}
