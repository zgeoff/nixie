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

  // the conversation's own scripted model
  readonly model: ScriptedModel;
}

export interface TestConversationOptions {
  // the context the conversation runs on, such as one on a test clock
  readonly context: TasksContext;
  readonly readTurnNote?: ConversationRunnerOptions['readTurnNote'];

  // the tools the conversation lists, from those the server's endpoint serves, and none when unset
  readonly toolNames?: readonly string[];

  // the memory each turn reads, such as a started store, and a memory that holds nothing when unset
  readonly memory?: ConversationOptions['memory'];
}

// Creates the conversation task and starts the conversation on a test server, on a scripted model
// of its own with the tools named or none, and stops it when the test finishes.
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
      personaHash: 'sha256:persona-test',
      policyHash: 'sha256:policy-test',
    }),
    ...(options.readTurnNote === undefined ? {} : { readTurnNote: options.readTurnNote }),

    // unless the test passes one, a memory with no pinned items that recalls nothing, so a turn
    // places no memory
    memory:
      options.memory ??
      (() => ({
        readPinnedCore: () => Promise.resolve([]),
        recall: () => Promise.resolve({ items: [], next: null }),
        readShortIDs: () => Promise.resolve(new Map()),
      })),
    log: () => {},
  });

  server.defer(() => runner.stop());

  return { runner, model };
}
