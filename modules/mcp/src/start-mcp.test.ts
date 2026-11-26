import { expect, test } from 'bun:test';
import { publishChanged } from '@heynixie/log';
import { startStandInMcp } from './test-utils/start-stand-in-mcp';

async function setupTest() {
  const hold = { next: () => Promise.resolve() };

  const standIn = await startStandInMcp({ holdOverrides: () => hold.next() });

  return {
    hold,
    publishChanged: (topics: Parameters<typeof publishChanged>[1]) => {
      publishChanged(standIn.test.log.writer, topics);
    },
    stop: () => Promise.resolve(standIn.mcp.stop()),
  };
}

test('it waits for a refresh that a change started before its stop returns', async () => {
  const ctx = await setupTest();

  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();

  ctx.hold.next = () => {
    entered.resolve();

    return release.promise;
  };

  ctx.publishChanged(['mcp']);

  await entered.promise;

  const order: string[] = [];

  const stopping = (async () => {
    await ctx.stop();

    order.push('stopped');
  })();

  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  order.push('released');
  release.resolve();

  await stopping;

  expect(order).toStrictEqual(['released', 'stopped']);
});

test('it starts no refresh for a change after its stop', async () => {
  const ctx = await setupTest();

  const reads: string[] = [];

  ctx.hold.next = () => {
    reads.push('overrides');

    return Promise.resolve();
  };

  await ctx.stop();

  ctx.publishChanged(['mcp', 'definitions']);

  await ctx.stop();

  expect(reads).toStrictEqual([]);
});
