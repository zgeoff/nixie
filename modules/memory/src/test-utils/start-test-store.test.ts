import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
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

test('it runs the store reads through the database plugin it is given', async () => {
  const ctx = await setupTest();

  const queries: string[] = [];

  const started = await startTestStore(
    {
      dataDir: ctx.dataDir,
      deploymentKey: ctx.deploymentKey,
      defer: (cleanup) => {
        ctx.stack.defer(cleanup);
      },
    },
    {
      dbPlugin: {
        transformQuery: (args) => {
          queries.push(args.node.kind);

          return args.node;
        },
        transformResult: (args) => Promise.resolve(args.result),
      },
    },
  );

  await readRecords(started.log, { afterSequence: 0 });

  expect(queries).toContain('SelectQueryNode');
});
