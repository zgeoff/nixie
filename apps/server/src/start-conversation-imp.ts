import type { StartedMemoryStore } from '@heynixie/memory';
import { buildMomentStatus, buildPinnedCoreStatus } from '@heynixie/memory';
import { resolveRoleProfile } from '@heynixie/models';
import {
  buildModelStatus,
  buildStartStatus,
  buildStartTimeStatus,
  buildStatusRegistry,
} from '@heynixie/sessions';
import type { SessionCleanupCause } from '@heynixie/sessions';
import type { RunStep } from '@heynixie/tasks';
import { getTaskName } from '@heynixie/tasks';
import { buildTaskMessaging } from './build-task-messaging';
import { buildVersionStatus } from './build-version-status';
import { makeConversationReadinessStep } from './make-conversation-readiness-step';
import { makeSkillCatalogLoader } from './make-skill-catalog-loader';
import { makeTurnNoteReader } from './make-turn-note-reader';
import { startConversation } from './start-conversation';
import { toSessionDefinitions } from './to-session-definitions';
import type { ServerParts } from './types';

export interface ConversationImp {
  readonly runStep: RunStep;

  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;
}

export async function startConversationImp(
  parts: ServerParts,
  memory: () => StartedMemoryStore,
): Promise<ConversationImp> {
  const messaging = buildTaskMessaging(parts.config);

  const conversation = await startConversation({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    tools: parts.tools.endpoint,
    toolNames: parts.tools.definitions.map((definition) => definition.name),
    image: parts.images.conversation.name,
    getDefinitions: () => toSessionDefinitions(parts.inForce.read()),
    readTurnNote: makeTurnNoteReader(
      {
        log: parts.context.log,
        clock: parts.context.clock,
        ownerName: parts.config.owner.name,
        defaultZone: parts.config.time.default_zone,
        compaction: parts.config.compaction,
        getTaskName: (taskID) => getTaskName(messaging, taskID),
      },
      memory,
    ),
    loadOrPinSkillCatalog: makeSkillCatalogLoader({
      log: parts.context.log,
      readInForce: () => parts.inForce.read(),
      profile: resolveRoleProfile(parts.config.models, 'conversation'),
      skills: parts.config.skills,
    }),
    status: buildStatusRegistry([
      buildStartStatus(),
      buildStartTimeStatus(),
      buildVersionStatus(),
      buildModelStatus(),
      ...buildPinnedCoreStatus(() => memory().readPinnedCoreUse()),
      buildMomentStatus((at) => memory().moments.readWeekCount(at), parts.config.owner.name),
    ]),
    memory,
    memorySettings: {
      ...parts.config.memory,
      ownerName: parts.config.owner.name,
      agentNames: parts.config.agent.names,
    },
    compaction: parts.config.compaction,
    defaultZone: parts.config.time.default_zone,
    messaging,
    log: parts.log,
  });

  await parts.cleanup.defer(() => conversation.stop());

  parts.state.update({ conversation: { isReady: true, reason: null } });

  return {
    runStep: makeConversationReadinessStep(parts.state, conversation.runStep),
    cleanupSessions: conversation.cleanupSessions,
  };
}
