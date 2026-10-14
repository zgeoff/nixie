import type { AnswerQuoteSource, StartedMemoryStore } from '@heynixie/memory';
import { buildProposalAnswerKind } from '@heynixie/memory';
import type { TurnNote } from '@heynixie/models';
import { buildEventRegistry, buildRetriedTurnKind } from '@heynixie/models';
import type { RunStep } from '@heynixie/tasks';
import { buildRestartKind } from './build-restart-kind';
import { makeConversationReadinessStep } from './make-conversation-readiness-step';
import { readTurnNotes } from './read-turn-notes';
import { startConversation } from './start-conversation';
import type { ServerParts } from './types';

export interface ConversationImp {
  // marks the conversation imp ready again after each turn that succeeds
  readonly runStep: RunStep;

  // the session cleanup a forget runs, which the memory store takes
  readonly cleanupSessions: (itemID: string) => Promise<void>;
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
    getSystemPrompt: () => parts.inForce.read()?.persona ?? '',
    readTurnNote: makeTurnNoteReader(parts, memory),
    memory,
    memorySettings: {
      ...parts.config.memory,
      ownerName: parts.config.owner.name,
      agentNames: parts.config.agent.names,
    },
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

// The note before each turn: the memory changes and the events, whose kinds read memory through the
// getter.
function makeTurnNoteReader(
  parts: ServerParts,
  memory: () => StartedMemoryStore,
): () => Promise<TurnNote> {
  const log = parts.context.log;
  const store: AnswerQuoteSource = {
    recall: (request) => memory().recall(request),
    proposals: {
      readRejectedEdits: (proposalIDs) => memory().proposals.readRejectedEdits(proposalIDs),
    },
  };
  const events = buildEventRegistry([
    buildProposalAnswerKind(log, store),
    buildRestartKind(log),
    buildRetriedTurnKind(log),
  ]);

  return () =>
    readTurnNotes({
      log,
      store,
      events,
      clock: parts.context.clock,
      ownerName: parts.config.owner.name,
      defaultZone: parts.config.time.default_zone,
    });
}
