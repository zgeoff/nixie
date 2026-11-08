import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';

export async function startTestLog(clock?: Clock): Promise<Log> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-connectors-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writerOptions = clock === undefined ? { dataDir } : { dataDir, clock };

  const writer = await startWriter(writerOptions);

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { writer, deploymentKey, projections: logProjections };
}
