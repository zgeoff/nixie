import { onTestFinished } from 'bun:test';
import { modelsConfigSchema } from '@heynixie/models';
import type { ConversationRunner, ConversationRunnerOptions } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';
import { createConversationTask } from '@heynixie/tasks';
import type { ScriptedModel } from '@heynixie/testing';
import { startScriptedModel } from '@heynixie/testing';
import type { ConversationOptions } from '../start-conversation';
import { startConversation } from '../start-conversation';
import type { TestServer } from './start-test-server';

export interface TestConversation {
  readonly runner: ConversationRunner;

  readonly model: ScriptedModel;
}

export interface TestConversationOptions {
  readonly context: TasksContext;
  readonly readTurnNote?: ConversationRunnerOptions['readTurnNote'];

  readonly toolNames?: readonly string[];

  readonly memory?: ConversationOptions['memory'];
}

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
    toolNames: options.toolNames ?? [],
    image: 'nixie-conversation-0123456789ab',
    getDefinitions: () => ({
      persona: 'You are nixie.',
      prompts: {},
      personaHash: 'sha256:persona-test',
      policyHash: 'sha256:policy-test',
    }),
    ...(options.readTurnNote === undefined ? {} : { readTurnNote: options.readTurnNote }),

    memory:
      options.memory ??
      (() => ({
        readPinnedCore: () => Promise.resolve([]),
        readPinnedCoreUse: () => Promise.resolve({ items: 0, tokens: 0, budget: 2000 }),
        recall: () => Promise.resolve({ items: [], next: null }),
        recallMessages: () => Promise.resolve({ messages: [] }),
        readShortIDs: () => Promise.resolve(new Map()),
      })),
    log: () => {},
  });

  server.defer(() => runner.stop());

  return { runner, model };
}
