import { expect, test } from 'bun:test';
import { encodeTurnFrame } from '@heynixie/wire';
import { buildMockSummarizeFrame } from '@heynixie/wire/test-utils';
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
