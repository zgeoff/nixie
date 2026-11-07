import { expect, test } from 'bun:test';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { buildStubSessionScript } from './build-stub-session-script';

function setupTest() {
  return {
    guest: { waitForMessage: () => Promise.reject(new Error('no message comes')) },
  };
}

test('it refuses the first turn with the model API error it was given', async () => {
  const ctx = setupTest();

  const script = buildStubSessionScript([
    { refusal: 'overloaded', detail: 'API Error: 529 Overloaded' },
  ]);

  const frames = await script(buildMockTurnFrame({ resume: null }), ctx.guest);

  expect(frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'model_api',
      error: 'overloaded',
      detail: 'API Error: 529 Overloaded',
    },
  ]);
});

test('it answers a retry that resumes where the session was and carries the refused message', async () => {
  const ctx = setupTest();

  const script = buildStubSessionScript([
    { refusal: 'overloaded', detail: 'API Error: 529 Overloaded' },
    { reply: 'The tide turns at four.' },
  ]);

  const input = [
    { uuid: '6e697869-0000-8000-8000-000000000011', text: 'When does the tide turn?' },
  ];

  await script(buildMockTurnFrame({ resume: null, input }), ctx.guest);

  const frames = await script(buildMockTurnFrame({ resume: null, input }), ctx.guest);

  expect(frames).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000011'] },
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: 'The tide turns at four.',
      toolUses: [],
    },
    {
      type: 'ended',
      boundary: {
        harness: 'agent-sdk',
        sessionID: expect.toBeString(),
        messageID: expect.toBeString(),
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);
});

test('it fails a retry that leaves out the message of the refused turn', async () => {
  const ctx = setupTest();

  const script = buildStubSessionScript([
    { refusal: 'overloaded', detail: 'API Error: 529 Overloaded' },
    { reply: 'The tide turns at four.' },
  ]);

  await script(
    buildMockTurnFrame({
      resume: null,
      input: [{ uuid: '6e697869-0000-8000-8000-000000000011', text: 'When does the tide turn?' }],
    }),
    ctx.guest,
  );

  const frames = await script(
    buildMockTurnFrame({
      resume: null,
      input: [{ uuid: '6e697869-0000-8000-8000-000000000012', text: 'And the wind?' }],
    }),
    ctx.guest,
  );

  expect(frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: expect.toInclude('without 1 messages') },
  ]);
});

test('it fails a turn that resumes somewhere other than the last answered turn', async () => {
  const ctx = setupTest();
  const script = buildStubSessionScript([{ reply: 'The tide turns at four.' }]);

  const frames = await script(
    buildMockTurnFrame({
      resume: {
        harness: 'agent-sdk',
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
    ctx.guest,
  );

  expect(frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: expect.toInclude('resumed at') },
  ]);
});

test('it resumes the next turn at the boundary of the turn it answered', async () => {
  const ctx = setupTest();

  const script = buildStubSessionScript([
    { reply: 'The tide turns at four.' },
    { reply: 'The wind drops at six.' },
  ]);

  const answered = await script(buildMockTurnFrame({ resume: null }), ctx.guest);

  const end = answered.at(-1);
  const resume = end?.type === 'ended' ? end.boundary : null;

  const frames = await script(buildMockTurnFrame({ resume }), ctx.guest);

  expect(frames.at(1)).toStrictEqual({
    type: 'assistant',
    messageID: expect.toBeString(),
    text: 'The wind drops at six.',
    toolUses: [],
  });
});
