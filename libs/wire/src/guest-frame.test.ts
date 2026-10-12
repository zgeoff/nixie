import { expect, test } from 'bun:test';
import type { GuestFrame } from './guest-frame';
import { guestFrameSchema } from './guest-frame';

test('it accepts an ended frame that marks a model API error', () => {
  const frame: GuestFrame = {
    type: 'ended',
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    subtype: 'success',
    stopReason: 'stop_sequence',
    isError: true,
    turns: 1,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };

  expect(guestFrameSchema.safeParse(frame).data).toStrictEqual(frame);
});

test('it accepts an ended frame from a guest that sends no error mark', () => {
  const frame: GuestFrame = {
    type: 'ended',
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    subtype: 'success',
    stopReason: 'end_turn',
    turns: 1,
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };

  expect(guestFrameSchema.safeParse(frame).data).toStrictEqual(frame);
});

test('it refuses an ended frame whose error mark is not a boolean', () => {
  const frame = {
    type: 'ended',
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    subtype: 'success',
    stopReason: 'end_turn',
    isError: 'yes',
    turns: 1,
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };

  expect(guestFrameSchema.safeParse(frame).error?.issues).toPartiallyContain({
    path: ['isError'],
  });
});
