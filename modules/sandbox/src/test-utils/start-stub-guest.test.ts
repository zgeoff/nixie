import { expect, test } from 'bun:test';
import { once } from 'node:events';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import { buildMockSummarizeFrame, buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { startStubGuest } from './start-stub-guest';

test('it ends on a stop while a script never settles', async () => {
  const stream = startStubGuest({
    onTurn: () => [],
    onSummary: () => new Promise(() => {}),
    onPurge: () => [],
  });

  await stream.send(encodeTurnFrame(buildMockSummarizeFrame()));

  const exited = await stream.stop();
  const messages = await Array.fromAsync(stream.messages);

  expect(exited).toMatchObject({ code: null, signal: 'SIGTERM' });
  expect(messages).toStrictEqual([]);
});

test('it sends the frames a script returns, then exits with code 0', async () => {
  const stream = startStubGuest({
    onTurn: () => [],
    onSummary: () => [{ type: 'failed', reason: 'error', detail: 'no session' }],
    onPurge: () => [],
  });

  await stream.send(encodeTurnFrame(buildMockSummarizeFrame()));

  const messages = await Array.fromAsync(stream.messages);
  const exited = await stream.exit;

  expect(messages).toHaveLength(1);
  expect(exited).toMatchObject({ code: 0, signal: null });
});

test('it aborts the script guest interrupt signal on an interrupt frame', async () => {
  const stream = startStubGuest({
    onTurn: async (_turn, guest) => {
      invariant(guest.interrupt);

      await once(guest.interrupt, 'abort');

      return [{ type: 'failed', reason: 'error', detail: 'interrupted' }];
    },
    onSummary: () => [],
    onPurge: () => [],
  });

  await stream.send(encodeTurnFrame(buildMockTurnFrame()));
  await stream.send(encodeTurnFrame({ type: 'interrupt' }));

  const messages = await Array.fromAsync(stream.messages);

  expect(messages.map((message) => decodeTurnFrame(guestFrameSchema, message))).toStrictEqual([
    { type: 'failed', reason: 'error', detail: 'interrupted' },
  ]);
});
