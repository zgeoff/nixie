import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { tasksProjections } from '../task/projection/tasks-projections';
import type { TasksContext } from '../types';
import type { TestDefinitionStore } from './build-test-definition-readers';
import { buildTestDefinitionStore } from './build-test-definition-readers';
import { buildTestRunSettings } from './build-test-run-settings';
import { buildTestTaskRunners } from './build-test-task-runners';

export interface TestTasks {
  readonly defer: (cleanup: () => Promise<void>) => void;
  readonly dataDir: string;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: TasksContext;

  // the versions and run policies that the context's definition readers answer with
  readonly definitionStore: TestDefinitionStore;
}

export async function startTestTasks(): Promise<TestTasks> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-tasks-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = { writer, deploymentKey, projections: [...logProjections, ...tasksProjections] };
  const clock = buildTestClock(1_000_000);
  const definitionStore = buildTestDefinitionStore();

  return {
    defer: (cleanup) => {
      stack.defer(cleanup);
    },
    dataDir,
    writer,
    clock,
    definitionStore,
    context: {
      log,
      clock,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      runSettings: buildTestRunSettings(),
      runners: buildTestTaskRunners(),
      readDefinitionVersion: definitionStore.readDefinitionVersion,
      readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
    },
  };
}
