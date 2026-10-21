import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  memoryWriterTaskID,
  startMemoryStore,
} from '@heynixie/memory';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import { startTestConversation } from './start-test-conversation';
import { startTestMemoryWriter } from './start-test-memory-writer';
import type { TestTools } from './start-test-tools';

export interface TestSessionModels {
  readonly modelURL: string;

  readonly writerModelURL: string | null;
}

export interface TestSessions {
  readonly steps: Readonly<Record<string, RunStep>>;
  readonly stop: () => Promise<void>;
}

export async function startTestSessions(
  context: TasksContext,
  tools: TestTools,
  models: TestSessionModels,
): Promise<TestSessions> {
  const conversation = await startTestConversation(context, tools, models.modelURL);

  const store = await startMemoryStore({
    log: context.log,
    definitions: context.definitions,
    cleanupSessions: () => Promise.resolve(),

    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: context.clock,
      findAllowRule: findNoAllowRule,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      limits: defaultGateLimits,
    },
  });

  const writer =
    models.writerModelURL === null
      ? null
      : await startTestMemoryWriter(context, tools, { store, modelURL: models.writerModelURL });

  return {
    steps: {
      [conversationTaskID]: conversation.runStep,
      ...(writer === null ? {} : { [memoryWriterTaskID]: writer.runStep }),
    },
    stop: async () => {
      await conversation.stop();
      await writer?.stop();
      await store.stop();
    },
  };
}
