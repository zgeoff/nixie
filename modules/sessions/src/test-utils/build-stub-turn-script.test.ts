import { expect, test } from 'bun:test';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { buildStubTurnScript } from './build-stub-turn-script';

test('it reads every inbox message and ends the turn at a fresh chain entry with no reply', async () => {
  const script = buildStubTurnScript(() => ({}));

  const turn = buildMockTurnFrame({
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
  });

  const frames = await script(turn, {
    waitForMessage: () => Promise.reject(new Error('no message comes')),
  });

  expect(frames).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
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

test('it ends the turn with the reply, the chain entry and the context the pick gives', async () => {
  const script = buildStubTurnScript(() => ({
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    reply: 'The gauge reads 3.2 m.',
    contextSize: 170_000,
    terminalReason: 'completed',
  }));

  const frames = await script(buildMockTurnFrame(), {
    waitForMessage: () => Promise.reject(new Error('no message comes')),
  });

  expect(frames.slice(1)).toStrictEqual([
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: 'The gauge reads 3.2 m.',
      toolUses: [],
    },
    {
      type: 'ended',
      boundary: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
      subtype: 'success',
      stopReason: 'end_turn',
      terminalReason: 'completed',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      context: { size: 170_000, window: 200_000 },
    },
  ]);
});

test('it marks an overflow end as an error at the stop sequence', async () => {
  const script = buildStubTurnScript(() => ({ terminalReason: 'blocking_limit' }));

  const frames = await script(buildMockTurnFrame(), {
    waitForMessage: () => Promise.reject(new Error('no message comes')),
  });

  expect(frames.at(-1)).toMatchObject({
    stopReason: 'stop_sequence',
    isError: true,
    terminalReason: 'blocking_limit',
  });
});

test('it picks how each turn ends from that turn frame', async () => {
  const script = buildStubTurnScript((turn) => ({
    contextSize: turn.resume === null ? 170_000 : 20_000,
  }));

  const first = await script(buildMockTurnFrame(), {
    waitForMessage: () => Promise.reject(new Error('no message comes')),
  });

  const resumed = await script(
    buildMockTurnFrame({
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
    { waitForMessage: () => Promise.reject(new Error('no message comes')) },
  );

  expect(first.at(-1)).toMatchObject({ context: { size: 170_000 } });
  expect(resumed.at(-1)).toMatchObject({ context: { size: 20_000 } });
});
