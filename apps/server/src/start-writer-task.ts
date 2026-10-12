import { join } from 'node:path';
import type { StartedMemoryStore, WriterGate } from '@heynixie/memory';
import type { RunStep } from '@heynixie/tasks';
import { startMemoryWriterRunner } from './start-memory-writer-runner';
import type { ServerParts } from './types';

// Starts the memory writer when a content gate exists, and returns its step. With no gate the
// writer stays off rather than apply unchecked text, and its cursor stays at the first record of
// the log, so the catch-up later covers everything from before.
export async function startWriterTask(
  parts: ServerParts,
  store: StartedMemoryStore,
  gate: WriterGate | null,
): Promise<RunStep | null> {
  if (gate === null) {
    parts.log('memory_writer.off', { reason: 'no content gate' });
    return null;
  }
  const writer = await startMemoryWriterRunner({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    socketDir: join(parts.config.server.dataDir, 'run', 'tools'),
    image: parts.images.conversation.name,
    store,
    gate,
    config: parts.config.memory_writer,
    getPersona: () => parts.inForce.read()?.persona ?? '',
    onError: (error) => {
      parts.onFailure(error);
    },
  });

  await parts.cleanup.defer(() => writer.stop());
  return writer.runStep;
}
