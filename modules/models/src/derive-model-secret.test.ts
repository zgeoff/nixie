import { expect, test } from 'bun:test';
import { deriveModelSecret } from './derive-model-secret';
import { buildMockModelProfile } from './test-utils/build-mock-model-profile';

test('it derives the frozen secret for a profile host and header, named by the profile', () => {
  const secret = deriveModelSecret({
    profile: {
      id: 'chat',
      baseURL: 'https://gateway.example:8443/anthropic',
      credential: 'deployment:gateway',
      authHeader: 'bearer',
      model: 'glm-5.3',
      effort: 'low',
      providerPin: null,
      contextTokens: null,
      prices: null,
    },
    credential: 'not-a-real-token',
  });

  expect(secret).toMatchInlineSnapshot(`
    {
      "header": "bearer",
      "host": "gateway.example",
      "name": "model-chat-db9f864fa9852890",
      "value": "not-a-real-token",
    }
  `);
});

test('it derives the same secret for the same profile and credential', () => {
  const resolved = { profile: buildMockModelProfile(), credential: 'key-one' };

  expect(deriveModelSecret(resolved)).toStrictEqual(deriveModelSecret(resolved));
});

test('it gives a changed credential a new name', () => {
  const profile = buildMockModelProfile();

  const first = deriveModelSecret({ profile, credential: 'key-one' });
  const rotated = deriveModelSecret({ profile, credential: 'key-two' });

  expect(rotated.name).not.toBe(first.name);
});
