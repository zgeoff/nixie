import { expect, test } from 'bun:test';
import { resolveRoleProfile } from './resolve-role-profile';

test.each([
  ['the role map names', 'checker', 'background'],
  ['the conversation has, for a role left unset,', 'worker', 'chat'],
] as const)('it picks the profile %s', (_label, role, expected) => {
  const profile = resolveRoleProfile(
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
        background: {
          id: 'background',
          baseURL: 'https://gateway.example',
          credential: 'deployment:gateway',
          authHeader: 'bearer',
          model: 'glm-5.3',
          effort: 'low',
          providerPin: null,
          prices: null,
        },
      },
      roles: { conversation: 'chat', checker: 'background' },
    },
    role,
  );

  expect(profile.id).toBe(expected);
});

test('it refuses a role map that names a missing profile', () => {
  expect(() =>
    resolveRoleProfile({ profiles: {}, roles: { conversation: 'chat' } }, 'conversation'),
  ).toThrowWithMessage(Error, 'the conversation role names the profile chat, which is not defined');
});
