import { expect, test } from 'bun:test';
import { ZodError } from 'zod';
import { decodeTurnFrame } from './decode-turn-frame';
import { guestFrameSchema } from './guest-frame';
import type { HostFrame } from './host-frame';
import { hostFrameSchema } from './host-frame';

const encoder = new TextEncoder();

test('it decodes a turn frame the host sent', () => {
  const frame: HostFrame = {
    type: 'turn',
    profile: {
      model: 'model-a',
      baseURL: 'https://api.anthropic.com',
      effort: 'low',
      authHeader: 'x-api-key',
      contextTokens: 400_000,
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: 'You are nixie.',
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
  };

  const message = encoder.encode(JSON.stringify(frame));

  expect(decodeTurnFrame(hostFrameSchema, message)).toStrictEqual(frame);
});

test('it refuses a turn frame whose input message has no uuid', () => {
  const frame = {
    type: 'turn',
    profile: {
      model: 'model-a',
      baseURL: 'https://api.anthropic.com',
      effort: 'low',
      authHeader: 'x-api-key',
      contextTokens: null,
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
    resume: null,
    systemPrompt: 'You are nixie.',
    input: [{ uuid: 'not-a-uuid', text: 'Hi.' }],
  };
  const result = hostFrameSchema.safeParse(frame);

  expect(result.error?.issues).toPartiallyContain({ path: ['input', 0, 'uuid'] });
});

test('it refuses a turn frame with an empty inbox', () => {
  const frame = {
    type: 'turn',
    profile: {
      model: 'model-a',
      baseURL: 'https://api.anthropic.com',
      effort: 'low',
      authHeader: 'x-api-key',
      contextTokens: null,
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
    resume: null,
    systemPrompt: 'You are nixie.',
    input: [],
  };
  const result = hostFrameSchema.safeParse(frame);

  expect(result.error?.issues).toPartiallyContain({ path: ['input'] });
});

test('it refuses a guest frame of a type the host does not know', () => {
  expect(() =>
    decodeTurnFrame(guestFrameSchema, encoder.encode(JSON.stringify({ type: 'model', id: 'x' }))),
  ).toThrow(ZodError);
});

test('it refuses a frame that is not JSON', () => {
  expect(() => decodeTurnFrame(guestFrameSchema, encoder.encode('{'))).toThrow(SyntaxError);
});
