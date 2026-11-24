import { expect, test } from 'bun:test';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const retries = { count: 0 };

  const port = {
    readStuck: () => Promise.resolve([{ kind: 'note', shortID: 'n7', openForMs: 400_000 }]),
    retryStuck: () => {
      retries.count += 1;

      return Promise.resolve([]);
    },
  };

  return { ...api, client: buildTestClient(api.url, laptop.token), port, retries };
}

test('#erasure.readStuck reads each forget open past the threshold, and retries none', async () => {
  const ctx = await setupTest();

  ctx.setErasure(ctx.port);

  const read = await ctx.client.erasure.readStuck();

  expect({ read, retries: ctx.retries.count }).toStrictEqual({
    read: { stuck: [{ kind: 'note', shortID: 'n7', openForMs: 400_000 }] },
    retries: 0,
  });
});

test('#erasure.retryStuck answers the forgets that stay open after the retry', async () => {
  const ctx = await setupTest();

  ctx.setErasure(ctx.port);

  const retried = await ctx.client.erasure.retryStuck();

  expect({ retried, retries: ctx.retries.count }).toStrictEqual({
    retried: { stuck: [] },
    retries: 1,
  });
});

test('#erasure.readStuck refuses until the erasure runner starts', async () => {
  const ctx = await setupTest();

  const read = ctx.client.erasure.readStuck();

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'ERASURE_NOT_STARTED' });
});

test('#erasure.retryStuck refuses a caller with no session', async () => {
  const ctx = await setupTest();

  ctx.setErasure(ctx.port);

  const retry = buildTestClient(ctx.url).erasure.retryStuck();

  await retry.catch(() => {});

  expect(retry).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
