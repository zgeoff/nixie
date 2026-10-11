import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, LogRecord } from '@heynixie/log';
import { logProjections, readRecords, startWriter } from '@heynixie/log';
import type { SandboxEvent, SandboxRecorder } from '@heynixie/sandbox';
import { buildSandboxRecorder, sandboxesProjection } from '@heynixie/sandbox';

export interface TestRecorder {
  readonly log: Log;
  readonly recorder: SandboxRecorder;
  readonly writeEvents: (events: readonly SandboxEvent[]) => Promise<void>;
  readonly readSandboxRecords: () => Promise<readonly LogRecord[]>;
}

export interface StartedTestRecorder extends TestRecorder {
  readonly stop: () => Promise<void>;
}

// Starts a writer on a fresh data directory with the sandboxes projection, and a recorder on it.
// stop stops the writer, then removes the directory.
export async function startTestRecorder(): Promise<StartedTestRecorder> {
  const stack = new AsyncDisposableStack();
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir }).catch(async (error: unknown) => {
    await stack.disposeAsync();
    throw error;
  });

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
    stop: () => stack.disposeAsync(),
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
