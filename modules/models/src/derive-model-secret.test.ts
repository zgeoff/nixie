import { expect, test } from 'bun:test';
import { bindHarness } from './bind-harness';
import { deriveModelSecret } from './derive-model-secret';
import { buildMockModelProfile } from './test-utils/build-mock-model-profile';

test('it derives the frozen secret for a profile host and header', () => {
  const profile = buildMockModelProfile({
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
  });

  const secret = deriveModelSecret(
    { profile, credential: 'not-a-real-token' },
    bindHarness(profile),
  );

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

  expect(deriveModelSecret(resolved, bindHarness(resolved.profile))).toStrictEqual(
    deriveModelSecret(resolved, bindHarness(resolved.profile)),
  );
});

test("it keeps the name of a long profile's secret within impd's 31-character name limit", () => {
  const profile = buildMockModelProfile({ id: 'a-profile-id-far-longer-than-any-impd-name' });
  const secret = deriveModelSecret({ profile, credential: 'key-one' }, bindHarness(profile));

  expect(secret.name).toMatch(/^nixie-model-[\da-f]{19}$/u);
});

test('it gives two profiles that share a credential and host different names', () => {
  const chat = buildMockModelProfile({ id: 'chat', baseURL: 'https://gateway.example' });
  const checker = buildMockModelProfile({ id: 'checker', baseURL: 'https://gateway.example' });
  const chatSecret = deriveModelSecret({ profile: chat, credential: 'key-one' }, bindHarness(chat));

  const checkerSecret = deriveModelSecret(
    { profile: checker, credential: 'key-one' },
    bindHarness(checker),
  );

  expect(checkerSecret.name).not.toBe(chatSecret.name);
});

test('it gives a changed credential that nixie holds a new name', () => {
  const profile = buildMockModelProfile();
  const first = deriveModelSecret({ profile, credential: 'key-one' }, bindHarness(profile));
  const rotated = deriveModelSecret({ profile, credential: 'key-two' }, bindHarness(profile));

  expect(rotated.name).not.toBe(first.name);
});

test('it names a secret the sandbox backend holds from the profile, header and host alone', () => {
  const profile = buildMockModelProfile({
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
  });

  const secret = deriveModelSecret({ profile, credential: null }, bindHarness(profile));

  expect(secret).toMatchInlineSnapshot(`
    {
      "header": "bearer",
      "host": "gateway.example",
      "name": "nixie-model-c0d52ebd28ac2aac838",
      "value": null,
    }
  `);
});

test('it gives a secret the sandbox backend holds a name apart from one nixie holds', () => {
  const profile = buildMockModelProfile();
  const held = deriveModelSecret({ profile, credential: 'null' }, bindHarness(profile));
  const stored = deriveModelSecret({ profile, credential: null }, bindHarness(profile));

  expect(stored.name).not.toBe(held.name);
});
