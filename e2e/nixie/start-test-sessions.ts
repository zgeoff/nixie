import {
  defaultGateLimits,
  findNoAllowRule,
  memoryWriterTaskID,
  startMemoryStore,
} from '../../modules/memory/src/index';
import type { RunStep, TasksContext } from '../../modules/tasks/src/index';
import { conversationTaskID } from '../../modules/tasks/src/index';
import { startTestConversation } from './start-test-conversation';
import { startTestMemoryWriter } from './start-test-memory-writer';
import type { TestTools } from './start-test-tools';

export interface TestSessionModels {
  readonly modelURL: string;

  // the memory writer's scripted model, or null to run no writer
  readonly writerModelURL: string | null;
}

export interface TestSessions {
  // the step of each task that runs its sessions in a guest, by task ID
  readonly steps: Readonly<Record<string, RunStep>>;
  readonly stop: () => Promise<void>;
}

// Starts the parts of the test build whose tasks run model sessions in guests: the conversation,
// and memory with its writer when the crash test asks for one.
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

    // no crash test checks a memory tool's write, so the checker fails closed and the clock is the
    // build's own
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
