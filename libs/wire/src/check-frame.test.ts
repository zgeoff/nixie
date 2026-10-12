import { expect, test } from 'bun:test';
import { checkReplySchema, checkRequestSchema } from './check-frame';

test('it accepts a check request', () => {
  const payload = {
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'low' as const,
      authHeader: 'x-api-key' as const,
    },
    systemPrompt: 'You check one candidate memory.',
    input: '<owner_message>\nI take my coffee black\n</owner_message>',
  };

  expect(checkRequestSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it refuses a check request with an empty input', () => {
  const result = checkRequestSchema.safeParse({
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'low',
      authHeader: 'x-api-key',
    },
    systemPrompt: 'You check one candidate memory.',
    input: '',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['input'] });
});

test('it accepts an answer reply with any structured output', () => {
  const payload = { kind: 'answer' as const, output: { verdict: 'asserted' }, costUSD: 0.003 };

  expect(checkReplySchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it refuses a failed reply with no reason', () => {
  const result = checkReplySchema.safeParse({ kind: 'failed' });

  expect(result.error?.issues).toPartiallyContain({ path: ['reason'] });
});
