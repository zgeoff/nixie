import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestStore } from './start-test-store';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-memory-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { stack, dataDir, deploymentKey };
}

test('it defers stopping the store and then the writer', async () => {
  const ctx = await setupTest();

  const deferred: (() => Promise<void>)[] = [];

  const started = await startTestStore(
    {
      dataDir: ctx.dataDir,
      deploymentKey: ctx.deploymentKey,
      defer: (cleanup) => {
        deferred.push(cleanup);
        ctx.stack.defer(cleanup);
      },
    },
    {},
  );

  expect(deferred).toHaveLength(2);
  expect(started.writer.dataDir).toBe(ctx.dataDir);
});
