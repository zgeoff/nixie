import { onTestFinished } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { modelsConfigSchema } from '@heynixie/models';
import type { TestSessionHost } from '@heynixie/sessions/test-utils';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import { runTaskSteps } from '@heynixie/tasks/test-utils';
import type { ScriptedModel, TestClock } from '@heynixie/testing';
import { buildTestClock, startScriptedModel } from '@heynixie/testing';
import { defaultGateLimits } from '../default-gate-limits';
import { defaultOwnerPronouns } from '../default-owner-pronouns';
import { findNoAllowRule } from '../find-no-allow-rule';
import type { GateContext } from '../gate-types';
import type { WriterStatus } from '../read-writer-status';
import type { StartedMemoryStore } from '../start-memory-store';
import { startMemoryStore } from '../start-memory-store';
import type { MemoryWriterRunner } from '../start-memory-writer-runner';
import { startMemoryWriterRunner } from '../start-memory-writer-runner';
import type { RecalledItem } from '../types';
import type { WriterConfigInput } from '../writer-config-schema';
import { writerConfigSchema } from '../writer-config-schema';
import { buildStubGate } from './build-stub-gate';

export interface TestMemoryWriter {
  // the host's context on a test clock that starts at 1,000,000 ms
  readonly context: TasksContext;
  readonly clock: TestClock;

  // the writer's own scripted model
  readonly model: ScriptedModel;
  readonly store: StartedMemoryStore;

  // the names in the directory of the writer's tool endpoint sockets
  readonly listSocketNames: () => Promise<readonly string[]>;

  // starts the writer, after the test records the messages its catch-up covers, on the host's
  // context unless the test passes its own
  readonly start: (start?: WriterStart) => Promise<MemoryWriterRunner>;

  // runs the writer's steps, and any other task's step the test passes, until the tasks settle or
  // isDone holds
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

interface WriterStart {
  readonly context?: TasksContext;
}

interface WriterRun {
  readonly isDone?: () => Promise<boolean>;
  readonly steps?: Readonly<Record<string, RunStep>>;
}

// What the writer runs on: a session host, or a test server, whose log folds the memory projections.
export type TestWriterHost = Pick<TestSessionHost, 'context' | 'sandboxes' | 'socketDir' | 'defer'>;

// Starts memory on a test host: the store, a scripted model for the writer, and the writer on that
// model once the test calls start. Everything it starts stops before the host does.
export async function startTestMemoryWriter(
  host: TestWriterHost,
  options: TestMemoryWriterOptions = {},
): Promise<TestMemoryWriter> {
  const clock = buildTestClock(1_000_000);
  const context = { ...host.context, clock };
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const store = await startTestStore(host, { context, clock, check: options.check });

  const started: { writer: MemoryWriterRunner | null } = { writer: null };

  return {
    context,
    clock,
    model,
    store,
    listSocketNames: () => readdir(host.socketDir),
    start: async (start = {}) => {
      started.writer = await startTestWriterRunner(host, {
        context: start.context ?? context,
        model,
        store,
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
  host: TestWriterHost,
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

  host.defer(() => store.stop());

  return store;
}

interface WriterWiring {
  readonly context: TasksContext;
  readonly model: ScriptedModel;
  readonly store: StartedMemoryStore;
  readonly options: TestMemoryWriterOptions;
}

async function startTestWriterRunner(
  host: TestWriterHost,
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
    sandboxes: host.sandboxes,

    // the writer's tools run direct, so nothing reaches the queue
    queue: {
      enqueue: () => Promise.reject(new Error('no memory writer tool runs queued')),
      waitForOutcome: () => Promise.resolve(null),
    },
    socketDir: host.socketDir,
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

  host.defer(() => writer.stop());

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
    ...(run.isDone === undefined ? {} : { isDone: run.isDone }),
    maxSteps: 20,
  });
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
