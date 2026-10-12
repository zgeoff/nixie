import { onTestFinished } from 'bun:test';
import { join } from 'node:path';
import type { RecalledItem, StartedMemoryStore, WriterStatus } from '@heynixie/memory';
import { startMemoryStore, writerConfigSchema } from '@heynixie/memory';
import { buildStubGate } from '@heynixie/memory/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import type { ScriptedModel, TestClock } from '@heynixie/testing';
import { buildTestClock, startScriptedModel } from '@heynixie/testing';
import type { MemoryWriterRunner } from '../start-memory-writer-runner';
import { startMemoryWriterRunner } from '../start-memory-writer-runner';
import { runTaskSteps } from './run-task-steps';
import type { TestServer } from './start-test-server';

export interface TestMemoryWriter {
  // the server's context on a test clock that starts at 1,000,000 ms
  readonly context: TasksContext;
  readonly clock: TestClock;

  // the writer's own scripted model
  readonly model: ScriptedModel;
  readonly store: StartedMemoryStore;

  // starts the writer, after the test records the messages its catch-up covers
  readonly start: () => Promise<MemoryWriterRunner>;

  // runs the writer's steps, and any other task's step the test passes, until the tasks settle or
  // isDone holds
  readonly run: (run?: WriterRun) => Promise<void>;

  // every active item, through recall
  readonly listItems: () => Promise<readonly RecalledItem[]>;
  readonly readStatus: () => Promise<WriterStatus>;
}

interface WriterRun {
  readonly isDone?: () => Promise<boolean>;
  readonly steps?: Readonly<Record<string, RunStep>>;
}

// Starts memory on a test server: the store, a scripted model for the writer, and the writer on
// that model with the stub gate and one message a batch, once the test calls start. Everything it
// starts stops before the server does.
export async function startTestMemoryWriter(server: TestServer): Promise<TestMemoryWriter> {
  const clock = buildTestClock(1_000_000);
  const context = { ...server.context, clock };
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const store = await startMemoryStore({
    log: context.log,
    definitions: context.definitions,
    cleanupSessions: () => Promise.resolve(),
  });

  server.defer(() => store.stop());

  const started: { writer: MemoryWriterRunner | null } = { writer: null };

  return {
    context,
    clock,
    model,
    store,
    start: async () => {
      started.writer = await startTestWriterRunner(server, { context, model, store });
      return started.writer;
    },
    run: (run) => runWriterSteps({ context, clock, writer: started.writer }, run),
    listItems: async () => {
      const recalled = await store.recall({ limit: 100 });

      return recalled.items;
    },
    readStatus: () => {
      if (started.writer === null) {
        throw new Error('the writer has not started');
      }
      return started.writer.readStatus();
    },
  };
}

interface WriterWiring {
  readonly context: TasksContext;
  readonly model: ScriptedModel;
  readonly store: StartedMemoryStore;
}

async function startTestWriterRunner(
  server: TestServer,
  wiring: WriterWiring,
): Promise<MemoryWriterRunner> {
  const writer = await startMemoryWriterRunner({
    context: wiring.context,
    models: modelsConfigSchema.parse({
      profiles: {
        'writer-direct': {
          base_url: wiring.model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'writer-direct', 'memory-writer': 'writer-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: server.sandboxes,
    socketDir: join(server.dataDir, 'tools'),
    image: 'nixie-conversation-0123456789ab',
    store: wiring.store,
    gate: buildStubGate(),
    config: writerConfigSchema.parse({ batch_messages: 1 }),
    getPersona: () => '',
    onError: (error) => {
      throw error;
    },
  });

  server.defer(() => writer.stop());
  return writer;
}

interface StepsWiring {
  readonly context: TasksContext;
  readonly clock: TestClock;
  readonly writer: MemoryWriterRunner | null;
}

async function runWriterSteps(wiring: StepsWiring, run: WriterRun = {}): Promise<void> {
  if (wiring.writer === null) {
    throw new Error('the writer has not started');
  }
  await runTaskSteps(wiring.context, {
    steps: { ...run.steps, 'memory-writer': wiring.writer.runStep },
    advance: (ms) => {
      wiring.clock.advance(ms);
    },
    ...(run.isDone === undefined ? {} : { isDone: run.isDone }),
    maxSteps: 20,
  });
}
