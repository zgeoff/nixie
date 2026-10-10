import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, LogRecord } from '@heynixie/log';
import { logProjections, readRecords, startWriter } from '@heynixie/log';
import type { SandboxEvent, SandboxRecorder } from '@heynixie/sandbox';
import { buildSandboxRecorder, sandboxesProjection } from '@heynixie/sandbox';

interface TestRecorder {
  readonly log: Log;
  readonly recorder: SandboxRecorder;
  readonly writeEvents: (events: readonly SandboxEvent[]) => Promise<void>;
  readonly readSandboxRecords: () => Promise<readonly LogRecord[]>;
}

// Starts a writer on a fresh data directory with the sandboxes projection, and a recorder on it.
// When the test finishes it stops the writer, then removes the directory.
export async function setupTestRecorder(): Promise<TestRecorder> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
  const log: Log = { writer, deploymentKey, projections: [...logProjections, sandboxesProjection] };
  const recorder = buildSandboxRecorder({
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  });

  return {
    log,
    recorder,
    writeEvents: makeEventWriter(recorder),
    readSandboxRecords: makeRecordReader(log),
  };
}

function makeEventWriter(recorder: SandboxRecorder): TestRecorder['writeEvents'] {
  return async (events) => {
    for (const event of events) {
      // oxlint-disable-next-line no-await-in-loop -- each record takes the next sequence
      await recorder.write(event);
    }
  };
}

function makeRecordReader(log: Log): TestRecorder['readSandboxRecords'] {
  return async () => {
    const entries = await readRecords(log, { afterSequence: 0 });

    return entries
      .map((entry) => entry.record)
      .filter((record) => record.kind.startsWith('sandbox.'));
  };
}
