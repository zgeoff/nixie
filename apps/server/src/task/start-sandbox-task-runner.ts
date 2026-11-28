import { buildCallStepHooks } from '@heynixie/calls';
import type { Connections } from '@heynixie/connections';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { SandboxRunner } from '@heynixie/sessions';
import { startSandboxRunner } from '@heynixie/sessions';
import { joinListedSkills } from '@heynixie/skills';
import { makeInStepActions } from '../action/make-in-step-actions';
import { readJobConnectionStatus } from '../connection/read-job-connection-status';
import type { CallsPart } from '../part/start-calls-part';
import { toImageNames } from '../sandbox/to-image-names';
import { readSkillCatalog } from '../skill/read-skill-catalog';
import type { ServerParts } from '../types';
import { buildTaskMessaging } from '../utils/build-task-messaging';
import { toSessionDefinitions } from '../utils/to-session-definitions';

export async function startSandboxTaskRunner(
  parts: ServerParts,
  memory: () => StartedMemoryStore,
  calls: CallsPart | null,
  connections: Connections | null,
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
    ...(connections === null
      ? {}
      : {
          readConnectionStatus: (pinned, timeZone) =>
            readJobConnectionStatus(connections, pinned, timeZone),
        }),
    messaging: buildTaskMessaging(parts.config),
    turnInputs: parts.turnInputs,
    ...(parts.spend === null ? {} : { gateway: parts.spend.gateway }),
    ...(parts.apiContext.spend === undefined ? {} : { spend: parts.apiContext.spend }),
    skills: {
      join: (input) =>
        joinListedSkills(parts.context.log, {
          thread: input.thread,
          inForce: parts.inForce.read(),
          list: input.list,
        }),
      readCatalog: (query) =>
        readSkillCatalog(
          {
            log: parts.context.log,
            readInForce: () => parts.inForce.read(),
            skills: parts.config.skills,
          },
          query,
        ),
    },
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
