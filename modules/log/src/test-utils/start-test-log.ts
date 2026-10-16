import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { logProjections } from '../log-projections';
import { startWriter } from '../start-writer';
import type { Log, Writer } from '../types';

interface TestLog {
  readonly dataDir: string;
  readonly writer: Writer;
  readonly log: Log;
  readonly clock: TestClock;
}

// Starts a writer on a fresh data directory and a test clock, with a new deployment key and the
// log's own projections. When the test finishes it stops the writer, then removes the directory.
export async function startTestLog(): Promise<TestLog> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-log-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const clock = buildTestClock(Date.parse('2026-10-16T09:00:00Z'));

  const writer = await startWriter({ dataDir, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { dataDir, writer, log: { writer, deploymentKey, projections: logProjections }, clock };
}
