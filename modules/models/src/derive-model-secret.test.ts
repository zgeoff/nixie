import { expect, test } from 'bun:test';
import { deriveModelSecret } from './derive-model-secret';
import { buildMockModelProfile } from './test-utils/build-mock-model-profile';

test('it derives the frozen secret for a profile host and header', () => {
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
      cacheTTL: '5m',
      prices: null,
    },
    credential: 'not-a-real-token',
  });

  expect(secret).toMatchInlineSnapshot(`
    {
      "header": "bearer",
      "host": "gateway.example",
      "name": "nixie-model-8e679008671a8080278",
      "value": "not-a-real-token",
    }
  `);
});

test('it derives the same secret for the same profile and credential', () => {
  const resolved = { profile: buildMockModelProfile(), credential: 'key-one' };

  expect(deriveModelSecret(resolved)).toStrictEqual(deriveModelSecret(resolved));
});

test("it keeps the name of a long profile's secret within impd's 31-character name limit", () => {
  const secret = deriveModelSecret({
    profile: buildMockModelProfile({ id: 'a-profile-id-far-longer-than-any-impd-name' }),
    credential: 'key-one',
  });

  expect(secret.name).toMatch(/^nixie-model-[\da-f]{19}$/u);
});

test('it gives two profiles that share a credential and host different names', () => {
  const chat = buildMockModelProfile({ id: 'chat', baseURL: 'https://gateway.example' });
  const checker = buildMockModelProfile({ id: 'checker', baseURL: 'https://gateway.example' });
  const chatSecret = deriveModelSecret({ profile: chat, credential: 'key-one' });
  const checkerSecret = deriveModelSecret({ profile: checker, credential: 'key-one' });

  expect(checkerSecret.name).not.toBe(chatSecret.name);
});

test('it gives a changed credential a new name', () => {
  const profile = buildMockModelProfile();
  const first = deriveModelSecret({ profile, credential: 'key-one' });
  const rotated = deriveModelSecret({ profile, credential: 'key-two' });

  expect(rotated.name).not.toBe(first.name);
});
