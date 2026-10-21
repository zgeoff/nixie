import { join } from 'node:path';
import { toErrorFields } from '@heynixie/logger';
import type { StartedMemoryStore } from '@heynixie/memory';
import { startMemoryConsolidatorRunner } from '@heynixie/memory';
import type { RunStep } from '@heynixie/tasks';
import type { ServerParts } from './types';

export async function startConsolidatorTask(
  parts: ServerParts,
  store: StartedMemoryStore,
): Promise<RunStep> {
  const consolidator = await startMemoryConsolidatorRunner({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    queue: parts.tools.actions.queue,
    socketDir: join(parts.config.server.dataDir, 'run', 'tools'),
    image: parts.images.conversation.name,
    store,
    config: parts.config.memory_consolidation,
    getPersona: () => parts.inForce.read()?.persona ?? '',
    ownerName: parts.config.owner.name,

    onError: (error) => {
      parts.log('memory_consolidator.run_failed', toErrorFields(error));
    },
  });

  await parts.cleanup.defer(() => consolidator.stop());

  parts.log('memory_consolidator.started', {
    periodMs: parts.config.memory_consolidation.periodMs,
  });

  return consolidator.runStep;
}
