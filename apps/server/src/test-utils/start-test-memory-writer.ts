import { onTestFinished } from 'bun:test';
import { readdir } from 'node:fs/promises';
import type {
  GateContext,
  RecalledItem,
  StartedMemoryStore,
  WriterConfigInput,
  WriterStatus,
} from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
  writerConfigSchema,
} from '@heynixie/memory';
import { buildStubGate } from '@heynixie/memory/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import type { ScriptedModel, TestClock } from '@heynixie/testing';
import { buildTestClock, startScriptedModel } from '@heynixie/testing';
import type { MemoryWriterRunner } from '../start-memory-writer-runner';
import { startMemoryWriterRunner } from '../start-memory-writer-runner';
import { runTaskSteps } from './run-task-steps';
import type { TestServer } from './start-test-server';

interface WriterStart {
  readonly context?: TasksContext;
}

interface WriterRun {
  readonly probeDone?: () => Promise<boolean>;
  readonly steps?: Readonly<Record<string, RunStep>>;
}

export interface TestMemoryWriter {
  // the server's context on a test clock that starts at 1,000,000 ms
  readonly context: TasksContext;
  readonly clock: TestClock;

  // the writer's own scripted model
  readonly model: ScriptedModel;
  readonly store: StartedMemoryStore;

  // the names in the directory of the writer's tool endpoint sockets
  readonly listSocketNames: () => Promise<readonly string[]>;

  // starts the writer, after the test records the messages its catch-up covers, on the server's
  // context unless the test passes its own
  readonly start: (start?: WriterStart) => Promise<MemoryWriterRunner>;

  // runs the writer's steps, and any other task's step the test passes, until the tasks settle or
  // probeDone holds
  readonly run: (run?: WriterRun) => Promise<void>;

  // every active item, through recall
  readonly listItems: () => Promise<readonly RecalledItem[]>;
  readonly readStatus: () => Promise<WriterStatus>;
}

export interface TestMemoryWriterOptions {
  // the store's checker; with one, the writer checks its batches through the store's own batch
  // gate, else through the stub gate while the store's checker fails closed
  readonly check?: GateContext['check'];

  // the writer's settings as the deployment configuration writes them, over one message a batch
  readonly writerConfig?: WriterConfigInput;
}

// Starts memory on a test server: the store, a scripted model for the writer, and the writer on
// that model once the test calls start. Everything it starts stops before the server does.
export async function startTestMemoryWriter(
  server: TestServer,
  options: TestMemoryWriterOptions = {},
): Promise<TestMemoryWriter> {
  const clock = buildTestClock(1_000_000);
  const context = { ...server.context, clock };
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const store = await startTestStore(server, { context, clock, check: options.check });

  const started: { writer: MemoryWriterRunner | null } = { writer: null };
  const socketDir = `${server.dataDir}/tools`;

  return {
    context,
    clock,
    model,
    store,
    listSocketNames: () => readdir(socketDir),
    start: async (start = {}) => {
      started.writer = await startTestWriterRunner(server, {
        context: start.context ?? context,
        model,
        store,
        socketDir,
        options,
      });

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

interface StoreWiring {
  readonly context: TasksContext;
  readonly clock: TestClock;
  readonly check: GateContext['check'] | undefined;
}

// the store, whose checker fails closed unless the test passes one
async function startTestStore(
  server: TestServer,
  wiring: StoreWiring,
): Promise<StartedMemoryStore> {
  const store = await startMemoryStore({
    log: wiring.context.log,
    definitions: wiring.context.definitions,
    cleanupSessions: () => Promise.resolve(),
    gate: {
      ...buildClosedGate(wiring.clock),
      ...(wiring.check === undefined ? {} : { check: wiring.check }),
    },
  });

  server.defer(() => store.stop());

  return store;
}

// with no checker from the test, the writer checks its batches through the stub gate, so the
// store's own checker fails closed
function buildClosedGate(clock: TestClock): GateContext {
  return {
    check: () =>
      Promise.resolve({
        verdict: 'unsure',
        reason: 'no checker is wired',
        model: 'no-checker',
        failure: 'error',
      }),
    clock,
    findAllowRule: findNoAllowRule,
    limits: defaultGateLimits,
    ownerName: null,
    ownerPronouns: defaultOwnerPronouns,
  };
}

interface WriterWiring {
  readonly context: TasksContext;
  readonly model: ScriptedModel;
  readonly store: StartedMemoryStore;
  readonly socketDir: string;
  readonly options: TestMemoryWriterOptions;
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

    // the writer's tools run direct, so nothing reaches the queue
    queue: {
      enqueue: () => Promise.reject(new Error('no memory writer tool runs queued')),
      waitForOutcome: () => Promise.resolve(null),
    },
    socketDir: wiring.socketDir,
    image: 'nixie-conversation-0123456789ab',
    store: wiring.store,

    // the store's batch gate when the test passes a checker, else the stub gate
    gate: wiring.options.check === undefined ? buildStubGate() : wiring.store.writes.batch,
    config: writerConfigSchema.parse({ batch_messages: 1, ...wiring.options.writerConfig }),
    getPersona: () => '',
    ownerName: null,
    assistantName: null,
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
    advance: (durationMs) => {
      wiring.clock.advance(durationMs);
    },
    ...(run.probeDone === undefined ? {} : { probeDone: run.probeDone }),
    maxSteps: 20,
  });
}
