import { expect, test } from 'bun:test';
import { deriveModelSecret } from './derive-model-secret';

test('it derives a secret for the profile host and header, named by the profile', () => {
  const secret = deriveModelSecret({
    profile: {
      id: 'chat',
      baseURL: 'https://gateway.example:8443/anthropic',
      credential: 'deployment:gateway',
      authHeader: 'bearer',
      model: 'glm-5.3',
      effort: 'low',
      providerPin: null,
      prices: null,
    },
    credential: 'not-a-real-token',
  });

  expect(secret).toStrictEqual({
    name: expect.toSatisfy((name: string) => /^model-chat-[\da-f]{16}$/u.test(name)),
    value: 'not-a-real-token',
    host: 'gateway.example',
    header: 'bearer',
  });
});

test('it gives a changed credential a new name and the same credential the same one', () => {
  const profile = {
    id: 'chat',
    baseURL: 'https://api.anthropic.com',
    credential: 'deployment:anthropic',
    authHeader: 'x-api-key',
    model: 'claude-test-1',
    effort: 'medium',
    providerPin: null,
    prices: null,
  } as const;
  const first = deriveModelSecret({ profile, credential: 'key-one' });
  const again = deriveModelSecret({ profile, credential: 'key-one' });
  const rotated = deriveModelSecret({ profile, credential: 'key-two' });

  expect(again.name).toBe(first.name);
  expect(rotated.name).not.toBe(first.name);
});
