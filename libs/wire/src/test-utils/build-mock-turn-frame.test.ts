import { expect, test } from 'bun:test';
import { hostFrameSchema } from '../host-frame';
import { buildMockTurnFrame } from './build-mock-turn-frame';

test('it builds a default turn frame', () => {
  const frame = buildMockTurnFrame();

  expect(frame).toStrictEqual({
    type: 'turn',
    profile: {
      harness: 'agent-sdk',
      model: expect.toBeString(),
      baseURL: expect.toStartWith('https://'),
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    tools: { url: expect.toStartWith('https://'), token: expect.toBeString() },
    resume: null,
    systemPrompt: expect.toBeString(),
    input: [{ uuid: expect.toBeString(), text: expect.toBeString() }],
    limits: { modelCalls: null, toolCallWaitMs: null },
  });

  expect(hostFrameSchema.parse(frame)).toStrictEqual(frame);
});

test('it applies overrides on top of the defaults', () => {
  const frame = buildMockTurnFrame({
    profile: { model: 'glm-5.3', authHeader: 'bearer' },
    tools: { token: 'run-token' },
    resume: {
      harness: 'agent-sdk',
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    limits: { modelCalls: 40, toolCallWaitMs: 900_000 },
  });

  expect(frame).toStrictEqual({
    type: 'turn',
    profile: {
      harness: 'agent-sdk',
      model: 'glm-5.3',
      baseURL: expect.toStartWith('https://'),
      effort: 'medium',
      authHeader: 'bearer',
      contextTokens: null,
      cacheTTL: '5m',
    },
    tools: { url: expect.toStartWith('https://'), token: 'run-token' },
    resume: {
      harness: 'agent-sdk',
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: expect.toBeString(),
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    limits: { modelCalls: 40, toolCallWaitMs: 900_000 },
  });
});

test('it keeps the default of a limit that the overrides leave out', () => {
  const frame = buildMockTurnFrame({ limits: { toolCallWaitMs: 900_000 } });

  expect(frame.limits).toStrictEqual({ modelCalls: null, toolCallWaitMs: 900_000 });
});
