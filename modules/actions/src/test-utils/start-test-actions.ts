import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { tasksProjections } from '@heynixie/tasks';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { TestTasks } from '@heynixie/tasks/test-utils';
import { buildTestClock } from '@heynixie/testing';
import { actionsProjection } from '../action/actions-projection';

export async function startTestActions(): Promise<TestTasks> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-actions-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [...logProjections, ...tasksProjections, actionsProjection],
  };

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
      readDefinitionVersion: definitionStore.readDefinitionVersion,
      readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
      runners: buildTestTaskRunners(),
    },
  };
}
