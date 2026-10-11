import type { RunStep } from '@heynixie/tasks';
import { startConversation } from './start-conversation';
import type { ServerParts } from './types';

// Starts the conversation on its image from the manifest, which replaces its sandbox when the image
// or the profile changed. The step it returns marks the conversation imp unready while the last
// turn failed.
export async function startConversationImp(parts: ServerParts): Promise<RunStep> {
  const conversation = await startConversation({
    context: parts.context,
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    tools: parts.tools.endpoint,
    toolNames: [parts.tools.webFetch.tool.name],
    image: parts.images.conversation.name,
    getSystemPrompt: () => parts.inForce.current?.persona ?? '',
  });

  await parts.cleanup.defer(() => conversation.stop());
  parts.state.conversation = { isReady: true, reason: null };
  return async (input) => {
    try {
      const result = await conversation.runStep(input);

      parts.state.conversation = { isReady: true, reason: null };
      return result;
    } catch (error) {
      parts.state.conversation = { isReady: false, reason: 'the last turn failed' };
      throw error;
    }
  };
}
