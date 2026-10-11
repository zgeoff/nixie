import { expect, test } from 'bun:test';
import { buildModelGrant } from './build-model-grant';

test.each([
  ['bearer', { ANTHROPIC_AUTH_TOKEN: 'imp-broker-placeholder' }],
  ['x-api-key', { ANTHROPIC_API_KEY: 'imp-broker-placeholder' }],
] as const)('it puts a placeholder where the CLI reads a %s credential', (header, env) => {
  expect(
    buildModelGrant({
      name: 'model-chat-1',
      value: 'not-a-real-key',
      host: 'api.anthropic.com',
      header,
    }),
  ).toStrictEqual({ secret: 'model-chat-1', host: 'api.anthropic.com', env });
});
