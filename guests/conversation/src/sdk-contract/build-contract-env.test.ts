import { expect, test } from 'bun:test';
import { buildContractEnv } from './build-contract-env';

test('it passes the credential, the proxy settings and the path, and homes the CLI in the config directory', () => {
  const env = buildContractEnv(
    {
      ANTHROPIC_AUTH_TOKEN: 'nixie-broker-placeholder',
      PATH: '/usr/bin',
      HTTPS_PROXY: 'http://127.0.0.1:3128',
      NODE_EXTRA_CA_CERTS: '/etc/proxy-ca.pem',
      ANTHROPIC_BASE_URL: 'https://caller.example',
      CLAUDE_CONFIG_DIR: '/caller/config',
    },
    '/tmp/contract-config',
  );

  expect(env).toStrictEqual({
    HTTPS_PROXY: 'http://127.0.0.1:3128',
    NODE_EXTRA_CA_CERTS: '/etc/proxy-ca.pem',
    PATH: '/usr/bin',
    HOME: '/tmp/contract-config',
    CLAUDE_CONFIG_DIR: '/tmp/contract-config',
    ANTHROPIC_AUTH_TOKEN: 'nixie-broker-placeholder',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  });
});

test('it passes an API key', () => {
  const env = buildContractEnv(
    { ANTHROPIC_API_KEY: 'placeholder-key', PATH: '/usr/bin' },
    '/tmp/contract-config',
  );

  expect(env['ANTHROPIC_API_KEY']).toBe('placeholder-key');
});

test('it refuses an environment with no credential', () => {
  expect(() => buildContractEnv({ PATH: '/usr/bin' }, '/tmp/contract-config')).toThrowWithMessage(
    Error,
    /needs ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY/u,
  );
});

test('it refuses an empty credential', () => {
  expect(() =>
    buildContractEnv(
      { ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_API_KEY: '', PATH: '/usr/bin' },
      '/tmp/contract-config',
    ),
  ).toThrowWithMessage(Error, /needs ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY/u);
});

test('it points the CLI at the base URL and the model of the run, small-model variables included', () => {
  const env = buildContractEnv(
    {
      ANTHROPIC_API_KEY: 'placeholder-key',
      PATH: '/usr/bin',
      NIXIE_SDK_CONTRACT_MODEL: 'glm-test-1',
      NIXIE_SDK_CONTRACT_BASE_URL: 'https://gateway.example/anthropic',
    },
    '/tmp/contract-config',
  );

  expect(env).toContainEntries([
    ['ANTHROPIC_BASE_URL', 'https://gateway.example/anthropic'],
    ['NIXIE_SDK_CONTRACT_MODEL', 'glm-test-1'],
    ['ANTHROPIC_SMALL_FAST_MODEL', 'glm-test-1'],
    ['ANTHROPIC_DEFAULT_HAIKU_MODEL', 'glm-test-1'],
  ]);
});

test('it sets no model or base URL variable when the run names none', () => {
  const env = buildContractEnv(
    { ANTHROPIC_API_KEY: 'placeholder-key', PATH: '/usr/bin', NIXIE_SDK_CONTRACT_MODEL: '' },
    '/tmp/contract-config',
  );

  expect(Object.keys(env)).not.toIncludeAnyMembers([
    'ANTHROPIC_BASE_URL',
    'NIXIE_SDK_CONTRACT_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  ]);
});
