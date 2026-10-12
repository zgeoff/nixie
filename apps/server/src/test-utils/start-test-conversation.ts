import { onTestFinished } from 'bun:test';
import type { ConversationRunner, ConversationRunnerOptions } from '@heynixie/models';
import { modelsConfigSchema } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { createConversationTask } from '@heynixie/tasks';
import type { ScriptedModel } from '@heynixie/testing';
import { startScriptedModel } from '@heynixie/testing';
import { startConversation } from '../start-conversation';
import type { TestServer } from './start-test-server';

export interface TestConversation {
  readonly runner: ConversationRunner;

  // the conversation's own scripted model
  readonly model: ScriptedModel;
}

export interface TestConversationOptions {
  // the context the conversation runs on, such as one on a test clock
  readonly context: TasksContext;
  readonly readTurnNote?: ConversationRunnerOptions['readTurnNote'];
}

// Creates the conversation task and starts the conversation on a test server, on a scripted model
// of its own with no tools, and stops it when the test finishes.
export async function startTestConversation(
  server: TestServer,
  options: TestConversationOptions,
): Promise<TestConversation> {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());
  await createConversationTask(options.context);

  const runner = await startConversation({
    context: options.context,
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: server.sandboxes,
    tools: server.endpoint,
    toolNames: [],
    image: 'nixie-conversation-0123456789ab',
    getSystemPrompt: () => 'You are nixie.',
    ...(options.readTurnNote === undefined ? {} : { readTurnNote: options.readTurnNote }),
  });

  server.defer(() => runner.stop());
  return { runner, model };
}
