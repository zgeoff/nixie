import type { Connections } from '@heynixie/connections';
import type { StartedMemoryStore } from '@heynixie/memory';
import { buildMomentStatus, buildPinnedCoreStatus } from '@heynixie/memory';
import { bindHarness, resolveRoleProfile } from '@heynixie/models';
import {
  buildModelStatus,
  buildStartStatus,
  buildStartTimeStatus,
  buildStatusRegistry,
} from '@heynixie/sessions';
import type { SessionCleanupCause } from '@heynixie/sessions';
import type { RunStep } from '@heynixie/tasks';
import { getTaskName } from '@heynixie/tasks';
import { makeInStepActions } from '../action/make-in-step-actions';
import { makeSkillCatalogLoader } from '../cli/make-skill-catalog-loader';
import { buildConnectionStatus } from '../connection/build-connection-status';
import { pickModelCredentialExpiry } from '../connection/pick-model-credential-expiry';
import { toImageNames } from '../sandbox/to-image-names';
import { makeTurnNoteReader } from '../turn/make-turn-note-reader';
import type { ServerParts } from '../types';
import { buildTaskMessaging } from '../utils/build-task-messaging';
import { toSessionDefinitions } from '../utils/to-session-definitions';
import { buildVersionStatus } from './build-version-status';
import { collectConversationToolNames } from './collect-conversation-tool-names';
import { makeConversationReadinessStep } from './make-conversation-readiness-step';
import { startConversation } from './start-conversation';

export interface ConversationImp {
  readonly runStep: RunStep;

  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;

  // ends every wait of a session cleanup, so a shutdown never waits on a stalled turn
  readonly stopCleanups: () => void;
}

export async function startConversationImp(
  parts: ServerParts,
  memory: () => StartedMemoryStore,
  connections: () => Connections | null,
): Promise<ConversationImp> {
  const messaging = buildTaskMessaging(parts.config);
  const conversationHarness = bindHarness(resolveRoleProfile(parts.config.models, 'conversation'));

  const conversation = await startConversation({
    context: parts.context,
    models: parts.config.models,
    credentials: parts.credentials,
    sandboxes: parts.tools.adapter,
    tools: parts.tools.endpoint,
    toolNames: collectConversationToolNames(
      parts.tools.definitions.map((definition) => definition.name),
      Object.keys(parts.config.mcp.servers),
    ),
    images: toImageNames(parts.images),
    getDefinitions: () => toSessionDefinitions(parts.inForce.read()),
    readTurnNote: makeTurnNoteReader(
      {
        log: parts.context.log,
        clock: parts.context.clock,
        ownerName: parts.config.owner.name,
        defaultZone: parts.config.time.default_zone,
        compaction: parts.config.compaction,
        getTaskName: (taskID) => getTaskName(messaging, taskID),
        forgetNotices: parts.config.forget_notices,
        readConnectionEvents: async (range) => {
          const events = await connections()?.readStatusEvents(range);

          return events ?? [];
        },
      },
      memory,
    ),
    loadOrPinSkillCatalog: makeSkillCatalogLoader({
      log: parts.context.log,
      readInForce: () => parts.inForce.read(),
      harness: conversationHarness,
      skills: parts.config.skills,
    }),
    status: buildStatusRegistry([
      buildStartStatus(),
      buildStartTimeStatus(),
      buildVersionStatus(),
      buildModelStatus(),
      ...buildPinnedCoreStatus(() => memory().readPinnedCoreUse()),
      buildMomentStatus((at) => memory().moments.readWeekCount(at), parts.config.owner.name),
      buildConnectionStatus({
        readAttention: async () => {
          const attention = await connections()?.readAttention();

          return attention ?? [];
        },
        readModelCredential: () =>
          Promise.resolve(
            pickModelCredentialExpiry(parts.config.model_credential, parts.context.clock.now()),
          ),
      }),
    ]),
    memory,
    memorySettings: {
      rebuildTokens: parts.config.memory.rebuildTokens,
      ownerName: parts.config.owner.name,
      agentNames: parts.config.agent.names,
    },
    compaction: parts.config.compaction,
    defaultZone: parts.config.time.default_zone,
    messaging,
    turnInputs: parts.turnInputs,
    ...(parts.spend === null ? {} : { gateway: parts.spend.gateway }),
    ...(parts.apiContext.spend === undefined ? {} : { spend: parts.apiContext.spend }),
    clearFetchPauses: parts.tools.webFetch.clearPauses,
    inStepActions: makeInStepActions(parts),
    log: parts.log,
  });

  await parts.cleanup.defer(() => conversation.stop());

  parts.state.update({ conversation: { isReady: true, reason: null } });

  return {
    runStep: makeConversationReadinessStep(parts.state, conversation.runStep),
    cleanupSessions: conversation.cleanupSessions,
    stopCleanups: conversation.stopCleanups,
  };
}
