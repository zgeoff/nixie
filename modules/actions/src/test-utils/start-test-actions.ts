import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { actionsProjection } from '../actions-projection';

interface TestActions {
  readonly dataDir: string;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: TasksContext;
}

// Starts a writer on a fresh data directory with the log's, the tasks and the actions projections,
// and a test clock at 1,000,000 ms. When the test finishes it stops the writer, then removes the
// directory.
export async function startTestActions(): Promise<TestActions> {
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

  return {
    dataDir,
    writer,
    clock,
    context: { log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) },
  };
}
