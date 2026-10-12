import type { StartedMemoryStore } from '@heynixie/memory';
import { readMemoryChangeNote } from '@heynixie/memory';
import type { RunStep } from '@heynixie/tasks';
import { startConversation } from './start-conversation';
import type { ServerParts } from './types';

export interface ConversationImp {
  // marks the conversation imp unready while the last turn failed
  readonly runStep: RunStep;

  // the session cleanup a forget runs, which the memory store takes
  readonly cleanupSessions: (itemID: string) => Promise<void>;
}

// Starts the conversation on its image from the manifest, which replaces its sandbox when the image
// or the profile changed. Each turn reads memory, and the note of outside memory changes, through
// the getter, because the store starts after the conversation and before any runner claims work.
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
    toolNames: [parts.tools.webFetch.tool.name],
    image: parts.images.conversation.name,
    getSystemPrompt: () => parts.inForce.read()?.persona ?? '',
    readTurnNote: () => readMemoryChangeNote(parts.context.log, memory(), memoryNoteCap),
    memory,
    memorySettings: parts.config.memory,
    log: parts.log,
  });

  await parts.cleanup.defer(() => conversation.stop());
  parts.state.update({ conversation: { isReady: true, reason: null } });
  return {
    runStep: async (input) => {
      try {
        const result = await conversation.runStep(input);

        parts.state.update({ conversation: { isReady: true, reason: null } });
        return result;
      } catch (error) {
        parts.state.update({ conversation: { isReady: false, reason: 'the last turn failed' } });
        throw error;
      }
    },
    cleanupSessions: conversation.cleanupSessions,
  };
}

// the note lists up to 5 changed items, then how many more
const memoryNoteCap = 5;
