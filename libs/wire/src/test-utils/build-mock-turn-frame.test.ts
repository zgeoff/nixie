import { expect, test } from 'bun:test';
import { hostFrameSchema } from '../host-frame';
import { buildMockTurnFrame } from './build-mock-turn-frame';

test('it builds a default turn frame', () => {
  const frame = buildMockTurnFrame();

  expect(frame).toStrictEqual({
    type: 'turn',
    profile: {
      model: expect.toBeString(),
      baseURL: expect.toStartWith('https://'),
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
    },
    tools: { url: expect.toStartWith('https://'), token: expect.toBeString() },
    resume: null,
    systemPrompt: expect.toBeString(),
    input: [{ uuid: expect.toBeString(), text: expect.toBeString() }],
  });
  expect(hostFrameSchema.parse(frame)).toStrictEqual(frame);
});

test('it applies overrides on top of the defaults', () => {
  const frame = buildMockTurnFrame({
    profile: { model: 'glm-5.3', authHeader: 'bearer' },
    tools: { token: 'run-token' },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
  });

  expect(frame).toStrictEqual({
    type: 'turn',
    profile: {
      model: 'glm-5.3',
      baseURL: expect.toStartWith('https://'),
      effort: 'medium',
      authHeader: 'bearer',
      contextTokens: null,
    },
    tools: { url: expect.toStartWith('https://'), token: 'run-token' },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: expect.toBeString(),
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
  });
});
