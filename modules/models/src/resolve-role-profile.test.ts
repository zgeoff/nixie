import { expect, test } from 'bun:test';
import { resolveRoleProfile } from './resolve-role-profile';
import { buildMockModelsConfig } from './test-utils/build-mock-models-config';

test.each([
  ['the role map names', 'checker', 'background'],
  ['the conversation has, for a role left unset,', 'worker', 'chat'],
] as const)('it picks the profile %s', (_label, role, expected) => {
  const config = buildMockModelsConfig({
    profiles: { chat: {}, background: {} },
    roles: { conversation: 'chat', checker: 'background' },
  });

  const profile = resolveRoleProfile(config, role);

  expect(profile.id).toBe(expected);
});

test('it refuses a role map that names a missing profile', () => {
  expect(() =>
    resolveRoleProfile({ profiles: {}, roles: { conversation: 'chat' } }, 'conversation'),
  ).toThrowWithMessage(Error, 'the conversation role names the profile chat, which is not defined');
});
