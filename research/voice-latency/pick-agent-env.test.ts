import { expect, test } from 'bun:test';
import { pickAgentEnv } from './pick-agent-env.ts';

test('it keeps the credential and network settings and drops everything else', () => {
  expect(
    pickAgentEnv({
      CLAUDE_CODE_OAUTH_TOKEN: 'broker',
      EDITOR: 'vim',
      HOME: '/home/caller',
      NO_PROXY: 'api.example.test',
      PATH: '/usr/bin',
    }),
  ).toStrictEqual({
    CLAUDE_CODE_OAUTH_TOKEN: 'broker',
    HOME: '/home/caller',
    NO_PROXY: 'api.example.test',
    PATH: '/usr/bin',
  });
});

test('it leaves out a setting that is not set', () => {
  expect(pickAgentEnv({ ANTHROPIC_API_KEY: undefined, PATH: '/usr/bin' })).toStrictEqual({ PATH: '/usr/bin' });
});
