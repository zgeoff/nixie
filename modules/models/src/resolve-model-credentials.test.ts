import { expect, test } from 'bun:test';
import { resolveModelCredentials } from './resolve-model-credentials';

test('it resolves each profile credential from the model_credentials entry its reference names', () => {
  const resolved = resolveModelCredentials(
    {
      profiles: {
        chat: {
          id: 'chat',
          baseURL: 'https://api.anthropic.com',
          credential: 'deployment:anthropic',
          authHeader: 'x-api-key',
          model: 'claude-test-1',
          effort: 'medium',
          providerPin: null,
          prices: null,
        },
      },
      roles: { conversation: 'chat' },
    },
    { model_credentials: { anthropic: 'not-a-real-key' } },
  );

  expect(resolved['chat']?.credential).toBe('not-a-real-key');
});

test('it refuses a profile whose entry the secrets file lacks', () => {
  expect(() =>
    resolveModelCredentials(
      {
        profiles: {
          chat: {
            id: 'chat',
            baseURL: 'https://api.anthropic.com',
            credential: 'deployment:anthropic',
            authHeader: 'x-api-key',
            model: 'claude-test-1',
            effort: 'medium',
            providerPin: null,
            prices: null,
          },
        },
        roles: { conversation: 'chat' },
      },
      { model_credentials: { gateway: 'not-a-real-token' } },
    ),
  ).toThrowWithMessage(
    Error,
    'the profile chat names the credential deployment:anthropic, and the secrets file has no model_credentials entry anthropic',
  );
});
