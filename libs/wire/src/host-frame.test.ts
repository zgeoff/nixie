import { expect, test } from 'bun:test';
import type { HostFrame } from './host-frame';
import { hostFrameSchema } from './host-frame';

test('it accepts a summarize frame that resumes the session at a point', () => {
  const frame: HostFrame = {
    type: 'summarize',
    profile: {
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: 'You are nixie.',
    instruction: 'Write a summary of this session.',
  };

  expect(hostFrameSchema.safeParse(frame).data).toStrictEqual(frame);
});

test('it refuses a summarize frame with no session to resume', () => {
  const result = hostFrameSchema.safeParse({
    type: 'summarize',
    profile: {
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    resume: null,
    systemPrompt: 'You are nixie.',
    instruction: 'Write a summary of this session.',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['resume'] });
});

test('it refuses a summarize frame with an empty instruction', () => {
  const result = hostFrameSchema.safeParse({
    type: 'summarize',
    profile: {
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    resume: {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: 'You are nixie.',
    instruction: '',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['instruction'] });
});
