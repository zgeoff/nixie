import { join } from 'node:path';
import type { StartedMemoryStore } from '@heynixie/memory';
import { startMemoryWriterRunner } from '@heynixie/memory';
import type { RunStep } from '@heynixie/tasks';
import { buildTaskMessaging } from './build-task-messaging';
import { runOffTaskStep } from './run-off-task-step';
import type { ServerParts } from './types';

export async function startWriterTask(
  parts: ServerParts,
  store: StartedMemoryStore,
): Promise<RunStep> {
  if (!parts.config.memory_writer.isEnabled) {
    parts.log('memory_writer.off');

    return runOffTaskStep;
  }

  const writer = await startMemoryWriterRunner({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    queue: parts.tools.actions.queue,
    socketDir: join(parts.config.server.dataDir, 'run', 'tools'),
    image: parts.images.conversation.name,
    store,
    gate: store.writes.batch,
    config: parts.config.memory_writer,
    getPersona: () => parts.inForce.read()?.persona ?? '',
    getPrompts: () => parts.inForce.read()?.prompts ?? {},
    ownerName: parts.config.owner.name,
    assistantName: parts.config.agent.names[0] ?? null,
    defaultZone: parts.config.time.default_zone,
    messaging: buildTaskMessaging(parts.config),
    onError: (error) => {
      parts.onFailure(error);
    },
  });

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
