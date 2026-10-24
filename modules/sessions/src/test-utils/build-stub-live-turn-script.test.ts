import { expect, mock, test } from 'bun:test';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { buildStubLiveTurnScript } from './build-stub-live-turn-script';

test('it lets a message arrive, then reads the opening messages and the live one and ends the turn', async () => {
  const arrive = mock(() => Promise.resolve());
  const live = buildStubLiveTurnScript(arrive);

  const frames = await live.script(
    buildMockTurnFrame({
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    }),
    {
      waitForMessage: () =>
        Promise.resolve({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also eggs.' }),
    },
  );

  expect(arrive).toHaveBeenCalledOnce();

  expect(frames).toStrictEqual([
    {
      type: 'read',
      uuids: ['6e697869-0000-8000-8000-000000000001', '6e697869-0000-8000-8000-000000000002'],
    },
    {
      type: 'ended',
      boundary: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);
});

test('it keeps the live message it received', async () => {
  const live = buildStubLiveTurnScript(() => Promise.resolve());

  await live.script(buildMockTurnFrame(), {
    waitForMessage: () =>
      Promise.resolve({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also eggs.' }),
  });

  expect(live.received).toStrictEqual([
    { uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also eggs.' },
  ]);
});
