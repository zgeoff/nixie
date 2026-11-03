import type { NixieRunner } from '@heynixie/sessions';
import { startNixieRunner } from '@heynixie/sessions';
import { buildTaskMessaging } from './build-task-messaging';
import { toSessionDefinitions } from './to-session-definitions';
import type { ServerParts } from './types';

// A started task gets the two tools every task holds and the clock, never the conversation's other
// tools: it runs untrusted, and the start may only narrow its starter's tools.
export const startedTaskToolNames = ['tasks.list', 'task.message', 'time.now'] as const;

export async function startNixieTaskRunner(parts: ServerParts): Promise<NixieRunner> {
  const runner = await startNixieRunner({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    image: parts.images.conversation.name,
    tools: parts.tools.endpoint,
    toolNames: startedTaskToolNames,
    getDefinitions: () => toSessionDefinitions(parts.inForce.read()),
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
