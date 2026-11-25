import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';

export interface CredentialTestLog {
  readonly dataDir: string;
  readonly log: Log;

  // closes the writer, as the end of a process does, and leaves the data on disk
  readonly stop: () => Promise<void>;
}

export interface CredentialTestLogOptions {
  readonly clock: Clock;

  // a data directory an earlier log wrote; a new one that the test removes by default
  readonly dataDir?: string;
}

// A real log on disk, with a writer that the test stops when it ends.
export async function startCredentialTestLog(
  options: CredentialTestLogOptions,
): Promise<CredentialTestLog> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const made =
    options.dataDir === undefined ? await mkdtemp(join(tmpdir(), 'nixie-credentials-')) : null;

  const dataDir = options.dataDir ?? made ?? '';

  if (made !== null) {
    stack.defer(() => rm(made, { recursive: true, force: true }));
  }

  const writer = await startWriter({ dataDir, clock: options.clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    dataDir,
    log: { writer, deploymentKey, projections: logProjections },
    stop: () => writer.stop(),
  };
}
