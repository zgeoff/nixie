import type { StartedMemoryStore } from '@heynixie/memory';
import { resolveRoleProfile } from '@heynixie/models';
import {
  buildModelStatus,
  buildStartStatus,
  buildStartTimeStatus,
  buildStatusRegistry,
} from '@heynixie/sessions';
import type { SessionCleanupCause } from '@heynixie/sessions';
import type { RunStep } from '@heynixie/tasks';
import { buildVersionStatus } from './build-version-status';
import { makeConversationReadinessStep } from './make-conversation-readiness-step';
import { makeSkillCatalogReader } from './make-skill-catalog-reader';
import { makeTurnNoteReader } from './make-turn-note-reader';
import { startConversation } from './start-conversation';
import { toSessionDefinitions } from './to-session-definitions';
import type { ServerParts } from './types';

export interface ConversationImp {
  // clears the failing mark on the conversation's turns after each turn that succeeds
  readonly runStep: RunStep;

  // the session cleanup a forget runs, which the memory store and the record forget take
  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;
}

// Starts the conversation on its image from the manifest, which replaces its sandbox when the image
// or the profile changed. Each turn reads memory and its note through the getter, because the
// store starts after the conversation and before any runner claims work.
export async function startConversationImp(
  parts: ServerParts,
  memory: () => StartedMemoryStore,
): Promise<ConversationImp> {
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
      },
      memory,
    ),
    readSkillCatalog: makeSkillCatalogReader({
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
    ]),
    memory,
    memorySettings: {
      ...parts.config.memory,
      ownerName: parts.config.owner.name,
      agentNames: parts.config.agent.names,
    },
    compaction: parts.config.compaction,
    defaultZone: parts.config.time.default_zone,
    log: parts.log,
  });

  await parts.cleanup.defer(() => conversation.stop());

  parts.state.update({ conversation: { isReady: true, reason: null } });

  return {
    runStep: makeConversationReadinessStep(parts.state, conversation.runStep),
    cleanupSessions: conversation.cleanupSessions,
  };
}
