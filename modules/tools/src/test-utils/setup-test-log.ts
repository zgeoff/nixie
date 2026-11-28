import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { budgetProjections } from '@heynixie/budgets';
import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { placesProjection } from '@heynixie/policy';

interface TestLog {
  readonly dataDir: string;
  readonly log: Log;
}

interface TestLogOptions {
  // a clock the test moves; the system clock when absent
  readonly clock?: Clock | undefined;
}

export async function setupTestLog(options: TestLogOptions = {}): Promise<TestLog> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-tools-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({
    dataDir,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    dataDir,
    log: {
      writer,
      deploymentKey,
      projections: [...logProjections, ...budgetProjections, placesProjection],
    },
  };
}
