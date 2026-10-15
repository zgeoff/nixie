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
    ownerName: parts.config.owner.name,
    onError: (error) => {
      parts.onFailure(error);
    },
  });

  // a failed read stops this writer, so the start's retry never leaves a second one running
  const status = await writer.readStatus().catch(async (error: unknown) => {
    await writer.stop();

    throw error;
  });

  await parts.cleanup.defer(() => writer.stop());

  parts.log('memory_writer.started', {
    cursor: status.cursor,
    startSequence: status.startSequence,
    backlog: status.backlog,
    isCatchingUp: status.isCatchingUp,
  });

  return writer.runStep;
}
