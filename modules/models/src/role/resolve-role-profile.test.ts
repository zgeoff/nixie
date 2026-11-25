import { expect, test } from 'bun:test';
import { buildMockModelsConfig } from '../test-utils/build-mock-models-config';
import { resolveRoleProfile } from './resolve-role-profile';

test.each([
  ['the role map names', 'checker', 'background'],
  ['the conversation has, for a role left unset,', 'worker', 'chat'],
  ['the role map names for a call', 'call', 'background'],
] as const)('it picks the profile %s', (_label, role, expected) => {
  const config = buildMockModelsConfig({
    profiles: { chat: {}, background: {} },
    roles: { conversation: 'chat', checker: 'background', call: 'background' },
  });

  const profile = resolveRoleProfile(config, role);

  expect(profile.id).toBe(expected);
});

test('it refuses a role map that names a missing profile', () => {
  const config = buildMockModelsConfig({ profiles: {}, roles: { conversation: 'chat' } });

  expect(() => resolveRoleProfile(config, 'conversation')).toThrowWithMessage(
    Error,
    'the conversation role names the profile chat, which is not defined',
  );
});
