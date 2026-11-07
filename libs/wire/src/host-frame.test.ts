import { expect, test } from 'bun:test';
import type { HostFrame } from './host-frame';
import { hostFrameSchema } from './host-frame';

test('it accepts a summarize frame that resumes the session at a point', () => {
  const frame: HostFrame = {
    type: 'summarize',
    profile: {
      harness: 'agent-sdk',
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    resume: {
      harness: 'agent-sdk',
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
      harness: 'agent-sdk',
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
      harness: 'agent-sdk',
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    resume: {
      harness: 'agent-sdk',
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
    systemPrompt: 'You are nixie.',
    instruction: '',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['instruction'] });
});

test.each([
  ['zero', 0],
  ['a negative count', -3],
  ['a fraction', 2.5],
])('it refuses a turn frame whose model call limit is %s', (_case, modelCalls) => {
  const result = hostFrameSchema.safeParse({
    type: 'turn',
    profile: {
      harness: 'agent-sdk',
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
    resume: null,
    systemPrompt: 'You are nixie.',
    limits: { modelCalls },
    input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['limits', 'modelCalls'] });
});

test('it accepts an interrupt frame', () => {
  const frame: HostFrame = { type: 'interrupt' };

  expect(hostFrameSchema.safeParse(frame).data).toStrictEqual(frame);
});

test('it refuses a turn frame whose profile names a harness with no turn profile', () => {
  const result = hostFrameSchema.safeParse({
    type: 'turn',
    profile: {
      harness: 'codex',
      model: 'gpt-test-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'bearer',
      contextTokens: null,
      cacheTTL: '5m',
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
    resume: null,
    systemPrompt: 'You are nixie.',
    input: [{ uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003', text: 'Hi.' }],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['profile', 'harness'] });
});
