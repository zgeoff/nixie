import { expect, test } from 'bun:test';
import { publishChanged, subscribeToChanged } from '@heynixie/log';
import { startStandInMcp } from './test-utils/start-stand-in-mcp';

async function setupTest() {
  const hold = { next: () => Promise.resolve() };

  const standIn = await startStandInMcp({
    holdOverrides: () => hold.next(),
    tools: [
      { name: 'item_get', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
    ],
  });

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);

  return {
    hold,
    writer: standIn.test.log.writer,
    list: () => standIn.mcp.list('tracker'),
    refuseRefresh: () => {
      standIn.site.refuseRefresh(true);
      standIn.site.expireAccessTokens();
    },
    publishChanged: (topics: Parameters<typeof publishChanged>[1]) => {
      publishChanged(standIn.test.log.writer, topics);
    },
    refreshTools: () => standIn.mcp.tools.refresh(),
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

test('it waits for a direct refresh of the tool catalog before its stop returns', async () => {
  const ctx = await setupTest();

  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();

  ctx.hold.next = () => {
    entered.resolve();

    return release.promise;
  };

  const refreshing = ctx.refreshTools();

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

  await Promise.all([stopping, refreshing]);

  expect(order).toStrictEqual(['released', 'stopped']);
});

test('it waits for the refit that a definitions change started before its stop returns', async () => {
  const ctx = await setupTest();

  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();

  ctx.hold.next = () => {
    entered.resolve();

    return release.promise;
  };

  ctx.publishChanged(['definitions']);

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

test('it tells an open page that a server needs a sign-in again once its refresh is refused', async () => {
  const ctx = await setupTest();

  const topics: (readonly string[])[] = [];

  const unsubscribe = subscribeToChanged(ctx.writer, (changed) => {
    topics.push(changed);
  });

  ctx.refuseRefresh();

  await ctx.list();
  await ctx.stop();

  unsubscribe();

  expect(topics.flat()).toContain('mcp');
});
