import { expect, onTestFinished, test } from 'bun:test';
import { nativeWebSocket } from '@heynixie/testing';
import { TEST_TOKEN } from '@impz/testing';
import { startImpd } from './start-impd';

async function setupTest() {
  const wrapped = globalThis.WebSocket;

  const impd = await startImpd({ version: '7.0.0' });

  onTestFinished(impd.stop);

  return { impd, wrapped };
}

test('it starts an impd that answers through its fault proxy', async () => {
  const ctx = await setupTest();

  ctx.impd.fail('imps/wake', { code: 'CONFLICT', status: 409 }, { times: 1 });

  expect(ctx.impd.client.imps.wake({ name: 'harbour', restartError: false })).rejects.toMatchObject(
    {
      code: 'CONFLICT',
    },
  );

  expect(TEST_TOKEN).toBeString();
});

test("it keeps Bun's own WebSocket in place for the test", async () => {
  const ctx = await setupTest();

  onTestFinished(() => {
    expect(globalThis.WebSocket).toBe(ctx.wrapped);
  });

  expect(globalThis.WebSocket).toBe(nativeWebSocket);
});
