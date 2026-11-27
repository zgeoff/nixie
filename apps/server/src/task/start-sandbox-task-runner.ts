import { buildCallStepHooks } from '@heynixie/calls';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { SandboxRunner } from '@heynixie/sessions';
import { startSandboxRunner } from '@heynixie/sessions';
import { makeInStepActions } from '../action/make-in-step-actions';
import type { CallsPart } from '../part/start-calls-part';
import { toImageNames } from '../sandbox/to-image-names';
import type { ServerParts } from '../types';
import { buildTaskMessaging } from '../utils/build-task-messaging';
import { toSessionDefinitions } from '../utils/to-session-definitions';

export async function startSandboxTaskRunner(
  parts: ServerParts,
  memory: () => StartedMemoryStore,
  calls: CallsPart | null,
): Promise<SandboxRunner> {
  const runner = await startSandboxRunner({
    context: parts.context,
    models: parts.config.models,
    credentials: parts.credentials,
    sandboxes: parts.tools.adapter,
    images: toImageNames(parts.images),
    tools: parts.tools.endpoint,
    getDefinitions: () => toSessionDefinitions(parts.inForce.read()),
    memory,
    memorySettings: {
      rebuildTokens: parts.config.memory.rebuildTokens,
      ownerName: parts.config.owner.name,
      agentNames: parts.config.agent.names,
    },
    memoryReadTools: parts.tools.taskBounds.memoryTools.read,
    compaction: parts.config.compaction,
    defaultZone: parts.config.time.default_zone,
    messaging: buildTaskMessaging(parts.config),
    turnInputs: parts.turnInputs,
    ...(parts.spend === null ? {} : { gateway: parts.spend.gateway }),
    ...(parts.apiContext.spend === undefined ? {} : { spend: parts.apiContext.spend }),
    clearFetchPauses: parts.tools.webFetch.clearPauses,
    inStepActions: makeInStepActions(parts),
    log: parts.log,
    ...(calls === null
      ? {}
      : {
          calls: buildCallStepHooks(
            calls.context,
            parts.tools.definitions.map((definition) => definition.name),
          ),
        }),
  });

  await parts.cleanup.defer(() => runner.stop());

  return runner;
}
