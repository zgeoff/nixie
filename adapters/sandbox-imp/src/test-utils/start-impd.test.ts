import { expect, onTestFinished, test } from 'bun:test';
import { nativeWebSocket } from '@heynixie/testing';
import { startImpd } from './start-impd';

async function setupTest() {
  const wrapped = globalThis.WebSocket;

  const impd = await startImpd();

  onTestFinished(impd.stop);

  return { impd, wrapped };
}

test('it starts an impd whose fault proxy answers a call with the fault', async () => {
  const ctx = await setupTest();

  ctx.impd.fail('imps/wake', { code: 'CONFLICT', status: 409 }, { times: 1 });

  expect(ctx.impd.client.imps.wake({ name: 'harbour', restartError: false })).rejects.toMatchObject(
    { code: 'CONFLICT' },
  );
});

test("it keeps Bun's own WebSocket in place until the test finishes", async () => {
  const ctx = await setupTest();

  onTestFinished(() => {
    expect(globalThis.WebSocket).toBe(ctx.wrapped);
  });

  expect(globalThis.WebSocket).toBe(nativeWebSocket);
});
