import { expect, test } from 'bun:test';
import { sessionPointSchema } from './session-point';

test('it reads a session point that names its harness', () => {
  expect(
    sessionPointSchema.parse({
      harness: 'agent-sdk',
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    }),
  ).toStrictEqual({
    harness: 'agent-sdk',
    sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
  });
});

test('it reads a stored session point with no harness as an Agent SDK point', () => {
  expect(
    sessionPointSchema.parse({
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    }),
  ).toStrictEqual({
    harness: 'agent-sdk',
    sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
  });
});

test('it refuses a session point on a harness with no point shape', () => {
  const result = sessionPointSchema.safeParse({
    harness: 'codex',
    sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['harness'] });
});
