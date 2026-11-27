import { writeUnknownOutcomes } from '@heynixie/actions';
import { removeUnheldSecrets } from '@heynixie/sandbox';
import { conversationTaskID, runRestartSweep } from '@heynixie/tasks';
import type { ServerParts } from '../types';
import { collectHostHeldNames } from './collect-host-held-names';
import { removeSweptSandboxes } from './remove-swept-sandboxes';

export async function runRestartSweepSteps(parts: ServerParts): Promise<void> {
  await runRestartSweep(parts.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(parts.context, parts.tools.actions.connectors),
    sandboxes: {
      removeStaleSandboxes: async () => {
        await removeSweptSandboxes(parts.context, {
          logger: parts.log,
          adapter: parts.tools.adapter,
          isComputerOn: parts.images.computer !== undefined,
          currentImages: Object.values(parts.images).map((image) => image.name),

          // The conversation's own setup replaces its old-image sandbox after it copies the session out.
          imageExemptOwners: [conversationTaskID],
        });

        // The adapter keeps every name this process added, so a grant a runner already made stays.
        await removeUnheldSecrets({
          log: parts.context.log,
          logger: parts.log,
          adapter: parts.tools.adapter,
          hostHeldNames: collectHostHeldNames(parts.config.models, parts.credentials),
        });
      },
    },
  });
}
