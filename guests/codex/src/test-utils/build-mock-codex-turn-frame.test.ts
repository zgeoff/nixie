import { expect, test } from 'bun:test';
import { hostFrameSchema } from '@heynixie/wire';
import { buildMockCodexTurnFrame } from './build-mock-codex-turn-frame';

test('it builds a turn frame that the host frame schema accepts', () => {
  const frame = buildMockCodexTurnFrame();

  expect(hostFrameSchema.parse(frame)).toStrictEqual(frame);
});

test('it applies the input and the limits it is given', () => {
  const frame = buildMockCodexTurnFrame({
    input: [{ uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d009', text: 'Other.' }],
    limits: { modelCalls: 3, toolCallWaitMs: null },
  });

  expect(frame).toStrictEqual(
    expect.objectContaining({
      input: [{ uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d009', text: 'Other.' }],
      limits: { modelCalls: 3, toolCallWaitMs: null },
    }),
  );
});
