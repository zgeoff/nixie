import { expect, test } from 'bun:test';
import { buildCodexEnv } from './build-codex-env';

test('it gives the CLI its home, the placeholder credential, the step token and the proxy variables', () => {
  expect(
    buildCodexEnv(
      {
        PATH: '/usr/bin',
        HTTPS_PROXY: 'http://proxy.test:3128',
        OPENAI_API_KEY: 'nixie-broker-placeholder',
        SECRET_ELSEWHERE: 'never-passed',
      },
      '/home/nixie',
      'step-token',
    ),
  ).toStrictEqual({
    PATH: '/usr/bin',
    HTTPS_PROXY: 'http://proxy.test:3128',
    HOME: '/home/nixie',
    CODEX_HOME: '/home/nixie/.codex',
    OPENAI_API_KEY: 'nixie-broker-placeholder',
    NIXIE_TOKEN: 'step-token',
  });
});

test('it refuses an environment with no placeholder credential', () => {
  expect(() => buildCodexEnv({ PATH: '/usr/bin' }, '/home/nixie', 'step-token')).toThrow(
    'the codex guest has no placeholder credential in OPENAI_API_KEY',
  );
});
