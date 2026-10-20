import { expect, test } from 'bun:test';
import { ZodError } from 'zod';
import { decodeTurnFrame } from './decode-turn-frame';
import { guestFrameSchema } from './guest-frame';
import type { HostFrame } from './host-frame';
import { hostFrameSchema } from './host-frame';

test('it decodes a turn frame the host sent', () => {
  const frame: HostFrame = {
    type: 'turn',
    profile: {
      model: 'model-a',
      baseURL: 'https://api.anthropic.com',
      effort: 'low',
      authHeader: 'x-api-key',
      contextTokens: 400_000,
      cacheTTL: '1h',
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: 'You are nixie.',
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
  };

  const message = new TextEncoder().encode(JSON.stringify(frame));

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
      cacheTTL: '5m',
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
      cacheTTL: '5m',
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
    resume: null,
    systemPrompt: 'You are nixie.',
    input: [],
  };

  const result = hostFrameSchema.safeParse(frame);

  expect(result.error?.issues).toPartiallyContain({ path: ['input'] });
});

test('it refuses a frame that reports a CLI compaction, which no guest sends', () => {
  const result = guestFrameSchema.safeParse({
    type: 'compacted',
    trigger: 'auto',
    preTokens: 104_000,
    postTokens: 3200,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['type'] });
});

test('it decodes a message frame whose message carries images', () => {
  const frame: HostFrame = {
    type: 'message',
    message: {
      uuid: '6e697869-0000-8000-8000-000000000001',
      text: 'The two door colours.',
      images: [
        {
          marker: '<dropped-image id="a1b2c3d4e5f6" n="1"/>',
          mediaType: 'image/png',
          data: 'iVBORw==',
        },
        {
          marker: '<dropped-image id="0f9e8d7c6b5a" n="2"/>',
          mediaType: 'image/gif',
          data: 'R0lGOA==',
        },
      ],
    },
  };

  const message = new TextEncoder().encode(JSON.stringify(frame));

  expect(decodeTurnFrame(hostFrameSchema, message)).toStrictEqual(frame);
});

test('it refuses an image of a type the model does not take', () => {
  const message = new TextEncoder().encode(
    JSON.stringify({
      type: 'message',
      message: {
        uuid: '6e697869-0000-8000-8000-000000000001',
        text: 'A photo.',
        images: [
          {
            marker: '<dropped-image id="a1b2c3d4e5f6" n="1"/>',
            mediaType: 'image/heic',
            data: 'AAAA',
          },
        ],
      },
    }),
  );

  expect(() => decodeTurnFrame(hostFrameSchema, message)).toThrow(ZodError);
});

test('it refuses an image whose data is not base64', () => {
  const message = new TextEncoder().encode(
    JSON.stringify({
      type: 'message',
      message: {
        uuid: '6e697869-0000-8000-8000-000000000001',
        text: 'A photo.',
        images: [
          {
            marker: '<dropped-image id="a1b2c3d4e5f6" n="1"/>',
            mediaType: 'image/png',
            data: 'not base64!',
          },
        ],
      },
    }),
  );

  expect(() => decodeTurnFrame(hostFrameSchema, message)).toThrow(ZodError);
});

test('it decodes a purge frame the host sent', () => {
  const message = new TextEncoder().encode(JSON.stringify({ type: 'purge' }));

  expect(decodeTurnFrame(hostFrameSchema, message)).toStrictEqual({ type: 'purge' });
});

test('it refuses a guest frame of a type the host does not know', () => {
  expect(() =>
    decodeTurnFrame(
      guestFrameSchema,
      new TextEncoder().encode(JSON.stringify({ type: 'model', id: 'x' })),
    ),
  ).toThrow(ZodError);
});

test('it refuses a frame that is not JSON', () => {
  expect(() => decodeTurnFrame(guestFrameSchema, new TextEncoder().encode('{'))).toThrow(
    SyntaxError,
  );
});
