import type { StartedMemoryStore } from '@heynixie/memory';
import type { NixieRunner } from '@heynixie/sessions';
import { startNixieRunner } from '@heynixie/sessions';
import { buildTaskMessaging } from './build-task-messaging';
import { toSessionDefinitions } from './to-session-definitions';
import type { ServerParts } from './types';

export async function startNixieTaskRunner(
  parts: ServerParts,
  memory: () => StartedMemoryStore,
): Promise<NixieRunner> {
  const runner = await startNixieRunner({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    image: parts.images.conversation.name,
    tools: parts.tools.endpoint,
    getDefinitions: () => toSessionDefinitions(parts.inForce.read()),
    memory,
    memorySettings: {
      ...parts.config.memory,
      ownerName: parts.config.owner.name,
      agentNames: parts.config.agent.names,
    },
    compaction: parts.config.compaction,
    defaultZone: parts.config.time.default_zone,
    messaging: buildTaskMessaging(parts.config),
    log: parts.log,
  });

  await parts.cleanup.defer(() => runner.stop());

  return runner;
}
