import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { tasksProjections } from '@heynixie/tasks';
import type { TasksContext, TasksTables } from '@heynixie/tasks';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import type { Kysely } from 'kysely';

interface TestTasks {
  readonly dataDir: string;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: TasksContext;
  readonly definitionStore: ReturnType<typeof buildTestDefinitionStore>;

  readonly db: Kysely<TasksTables>;
}

interface TestTasksOptions {
  // starts the clock the log stamps its records with, so a test moves the time between records
  readonly recordsAtMs?: number;
}

export async function startTestTasks(options: TestTasksOptions = {}): Promise<TestTasks> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-sessions-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const clock = buildTestClock(options.recordsAtMs ?? 1_000_000);

  const writer = await startWriter({
    dataDir,
    ...(options.recordsAtMs === undefined ? {} : { clock }),
  });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = { writer, deploymentKey, projections: [...logProjections, ...tasksProjections] };
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
