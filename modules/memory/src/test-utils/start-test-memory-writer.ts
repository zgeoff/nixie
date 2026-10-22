import { readdir } from 'node:fs/promises';
import { modelsConfigSchema } from '@heynixie/models';
import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { TestSessionHost } from '@heynixie/sessions/test-utils';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import { runTaskSteps } from '@heynixie/tasks/test-utils';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
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

interface WriterStart {
  readonly context?: TasksContext;
}

interface WriterRun {
  readonly probeDone?: () => Promise<boolean>;
  readonly steps?: Readonly<Record<string, RunStep>>;
}

export interface TestMemoryWriter {
  readonly context: TasksContext;
  readonly clock: TestClock;

  readonly guest: StubGuestSandboxes;
  readonly store: StartedMemoryStore;

  readonly listSocketNames: () => Promise<readonly string[]>;

  readonly start: (start?: WriterStart) => Promise<MemoryWriterRunner>;

  readonly run: (run?: WriterRun) => Promise<void>;

  readonly listItems: () => Promise<readonly RecalledItem[]>;
  readonly readStatus: () => Promise<WriterStatus>;
}

export interface TestMemoryWriterOptions {
  readonly check?: GateContext['check'];

  readonly writerConfig?: WriterConfigInput;
}

export type TestWriterHost = Pick<
  TestSessionHost,
  'context' | 'sandboxes' | 'guest' | 'socketDir' | 'defer'
>;

export async function startTestMemoryWriter(
  host: TestWriterHost,
  options: TestMemoryWriterOptions = {},
): Promise<TestMemoryWriter> {
  const clock = buildTestClock(1_000_000);
  const context = { ...host.context, clock };

  const store = await startTestStore(host, { context, clock, check: options.check });

  const started: { writer: MemoryWriterRunner | null } = { writer: null };

  return {
    context,
    clock,
    guest: host.guest,
    store,
    listSocketNames: () => readdir(host.socketDir),
    start: async (start = {}) => {
      started.writer = await startTestWriterRunner(host, {
        context: start.context ?? context,
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
    defaultZone: 'UTC',
    findAllowRule: findNoAllowRule,
    limits: defaultGateLimits,
    ownerName: null,
    ownerPronouns: defaultOwnerPronouns,
  };
}

interface WriterWiring {
  readonly context: TasksContext;
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
          base_url: 'https://models.example.test',
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

    queue: {
      enqueue: () => Promise.reject(new Error('no memory writer tool runs queued')),
      waitForOutcome: () => Promise.resolve(null),
    },
    socketDir: host.socketDir,
    image: 'nixie-conversation-0123456789ab',
    store: wiring.store,

    gate: wiring.options.check === undefined ? buildStubGate() : wiring.store.writes.batch,
    config: writerConfigSchema.parse({ batch_messages: 1, ...wiring.options.writerConfig }),
    getPersona: () => '',
    ownerName: null,
    assistantName: null,
    defaultZone: 'UTC',
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
    ...(run.probeDone === undefined ? {} : { probeDone: run.probeDone }),
    maxSteps: 20,
  });
}
