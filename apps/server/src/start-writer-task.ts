import { join } from 'node:path';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { RunStep } from '@heynixie/tasks';
import { startMemoryWriterRunner } from './start-memory-writer-runner';
import type { ServerParts } from './types';

// Starts the memory writer with the store's batch gate, and returns its step. Its first start
// leaves the cursor at the first record of the log, so the catch-up covers everything from before
// and starts by itself.
export async function startWriterTask(
  parts: ServerParts,
  store: StartedMemoryStore,
): Promise<RunStep> {
  const writer = await startMemoryWriterRunner({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    socketDir: join(parts.config.server.dataDir, 'run', 'tools'),
    image: parts.images.conversation.name,
    store,
    gate: store.writes.batch,
    config: parts.config.memory_writer,
    getPersona: () => parts.inForce.read()?.persona ?? '',
    onError: (error) => {
      parts.onFailure(error);
    },
  });

  await parts.cleanup.defer(() => writer.stop());

  const status = await writer.readStatus();

  parts.log('memory_writer.started', {
    cursor: status.cursor,
    startSequence: status.startSequence,
    backlog: status.backlog,
    isCatchingUp: status.isCatchingUp,
  });
  return writer.runStep;
}
