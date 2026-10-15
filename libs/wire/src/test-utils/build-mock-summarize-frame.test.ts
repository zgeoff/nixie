import { expect, test } from 'bun:test';
import { hostFrameSchema } from '../host-frame';
import { buildMockSummarizeFrame } from './build-mock-summarize-frame';

test('it builds a default summarize frame', () => {
  const frame = buildMockSummarizeFrame();

  expect(frame).toStrictEqual({
    type: 'summarize',
    profile: {
      model: expect.toBeString(),
      baseURL: expect.toStartWith('https://'),
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
    },
    resume: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
    systemPrompt: expect.toBeString(),
    instruction: expect.toBeString(),
  });

  expect(hostFrameSchema.parse(frame)).toStrictEqual(frame);
});

test('it applies overrides on top of the defaults', () => {
  const frame = buildMockSummarizeFrame({
    profile: { model: 'glm-5.3', authHeader: 'bearer' },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    instruction: 'Write a summary of this session.',
  });

  expect(frame).toStrictEqual({
    type: 'summarize',
    profile: {
      model: 'glm-5.3',
      baseURL: expect.toStartWith('https://'),
      effort: 'medium',
      authHeader: 'bearer',
      contextTokens: null,
    },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: expect.toBeString(),
    instruction: 'Write a summary of this session.',
  });
});
