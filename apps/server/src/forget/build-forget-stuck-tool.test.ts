import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildForgetRetryTool } from './build-forget-retry-tool';
import { buildForgetStuckTool } from './build-forget-stuck-tool';

function setupTest() {
  const retries = { count: 0 };

  const port = {
    readStuck: () =>
      Promise.resolve([
        { kind: 'note', shortID: 'n7', openForMs: 400_000 },
        { kind: 'moment', shortID: null, openForMs: 61_000 },
      ]),
    retryStuck: () => {
      retries.count += 1;

      return Promise.resolve([{ kind: 'note', shortID: 'n7', openForMs: 430_000 }]);
    },
  };

  const call = { callID: 'call-1', tool: 'forget.stuck', input: {}, toolUseID: null };

  return { retries, port, call, context: buildMockToolContext() };
}

test('#buildForgetStuckTool lists each stuck forget by kind, short ID and whole minutes, and retries none', async () => {
  const ctx = setupTest();

  const outcome = await buildForgetStuckTool(() => ctx.port).run(ctx.call, ctx.context);

  expect({ outcome, retries: ctx.retries.count }).toStrictEqual({
    outcome: {
      status: 'ok',
      result: {
        stuck: [
          { kind: 'note', id: 'n7', openMinutes: 6 },
          { kind: 'moment', id: null, openMinutes: 1 },
        ],
      },
    },
    retries: 0,
  });
});

test('#buildForgetRetryTool runs the stuck forgets again and lists those still open', async () => {
  const ctx = setupTest();

  const outcome = await buildForgetRetryTool(() => ctx.port).run(ctx.call, ctx.context);

  expect({ outcome, retries: ctx.retries.count }).toStrictEqual({
    outcome: { status: 'ok', result: { stuck: [{ kind: 'note', id: 'n7', openMinutes: 7 }] } },
    retries: 1,
  });
});

test('#buildForgetStuckTool and #buildForgetRetryTool refuse until the erasure runner starts', async () => {
  const ctx = setupTest();

  const outcomes = await Promise.all([
    buildForgetStuckTool(() => null).run(ctx.call, ctx.context),
    buildForgetRetryTool(() => null).run(ctx.call, ctx.context),
  ]);

  expect(outcomes).toStrictEqual([
    { status: 'error', message: 'nixie has not started its forgets yet; try again in a moment' },
    { status: 'error', message: 'nixie has not started its forgets yet; try again in a moment' },
  ]);
});
