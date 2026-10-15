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

test('it accepts an ended frame with the context of its last model call', () => {
  const frame: GuestFrame = {
    type: 'ended',
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    subtype: 'success',
    stopReason: 'end_turn',
    turns: 2,
    usage: { inputTokens: 80, outputTokens: 5, cacheReadTokens: 70_000, cacheWriteTokens: 1200 },
    context: { size: 41_000, window: 400_000 },
  };

  expect(guestFrameSchema.safeParse(frame).data).toStrictEqual(frame);
});

test('it refuses an ended frame whose context window is zero', () => {
  const frame = {
    type: 'ended',
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    subtype: 'success',
    stopReason: 'end_turn',
    turns: 2,
    usage: { inputTokens: 80, outputTokens: 5, cacheReadTokens: 70_000, cacheWriteTokens: 1200 },
    context: { size: 41_000, window: 0 },
  };

  expect(guestFrameSchema.safeParse(frame).error?.issues).toPartiallyContain({
    path: ['context', 'window'],
  });
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

test('it accepts an ended frame with the reason the SDK gave for its end', () => {
  const frame: GuestFrame = {
    type: 'ended',
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    subtype: 'success',
    stopReason: 'stop_sequence',
    isError: true,
    terminalReason: 'prompt_too_long',
    turns: 1,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };

  expect(guestFrameSchema.safeParse(frame).data).toStrictEqual(frame);
});

test('it refuses an ended frame whose end reason is not a string', () => {
  const frame = {
    type: 'ended',
    boundary: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    subtype: 'success',
    stopReason: 'stop_sequence',
    terminalReason: 413,
    turns: 1,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };

  expect(guestFrameSchema.safeParse(frame).error?.issues).toPartiallyContain({
    path: ['terminalReason'],
  });
});
