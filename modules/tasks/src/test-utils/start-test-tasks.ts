import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { tasksProjections } from '../tasks-projections';
import type { TasksContext } from '../types';

interface TestTasks {
  readonly dataDir: string;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: TasksContext;
}

// Starts a writer on a fresh data directory with the log's and the tasks projections, and a test
// clock at 1,000,000 ms. When the test finishes it stops the writer, then removes the directory.
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

  return {
    dataDir,
    writer,
    clock,
    context: { log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) },
  };
}
