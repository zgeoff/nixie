import { expect, test } from 'bun:test';
import { buildStubContractEnv } from './build-stub-contract-env';

test('it points the CLI at the stub model with a placeholder key, in its own config folder', () => {
  expect(
    buildStubContractEnv(
      { PATH: '/usr/bin', HOME: '/home/keeper' },
      'http://127.0.0.1:4100',
      '/srv/probe',
    ),
  ).toStrictEqual({
    PATH: '/usr/bin',
    HOME: '/srv/probe',
    CLAUDE_CONFIG_DIR: '/srv/probe',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:4100',
    ANTHROPIC_API_KEY: 'stub-placeholder',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  });
});
