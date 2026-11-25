import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { mapActionProposalRecord } from '@heynixie/policy';
import { buildProposalsProjection } from '@heynixie/proposals';
import { tasksProjections } from '@heynixie/tasks';
import type { TasksContext, TasksTables } from '@heynixie/tasks';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { FakeClock } from '@zgeoff/testing/clock';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { Kysely } from 'kysely';

interface TestTasks {
  readonly dataDir: string;
  readonly writer: Writer;
  readonly clock: FakeClock;
  readonly context: TasksContext;
  readonly definitionStore: ReturnType<typeof buildTestDefinitionStore>;

  readonly db: Kysely<TasksTables>;
}

interface TestTasksOptions {
  // starts the clock the log stamps its records with, so a test moves the time between records
  readonly recordsAtMs?: number;

  // folds the action proposals into their table too, for a test that reads open proposals
  readonly withProposals?: true;
}

export async function startTestTasks(options: TestTasksOptions = {}): Promise<TestTasks> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-sessions-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const clock = createFakeClock({ startMs: options.recordsAtMs ?? 1_000_000 });

  const writer = await startWriter({
    dataDir,
    ...(options.recordsAtMs === undefined ? {} : { clock }),
  });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...tasksProjections,
      ...(options.withProposals === true
        ? [buildProposalsProjection([mapActionProposalRecord])]
        : []),
    ],
  };

  const definitionStore = buildTestDefinitionStore();

  return {
    dataDir,
    writer,
    clock,
    definitionStore,
    context: {
      log,
      clock,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      runSettings: buildTestRunSettings(),
      readDefinitionVersion: definitionStore.readDefinitionVersion,
      readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
      readDefinitionNextFire: definitionStore.readDefinitionNextFire,
      runners: buildTestTaskRunners(),
    },
    db: writer.db.$extendTables<TasksTables>(),
  };
}
