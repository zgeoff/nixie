import { expect, test } from 'bun:test';
import { buildContractEnv } from './build-contract-env';

test('it passes the token, the proxy settings and the path, and homes the CLI in the config directory', () => {
  const env = buildContractEnv(
    {
      CLAUDE_CODE_OAUTH_TOKEN: 'placeholder-token',
      PATH: '/usr/bin',
      HTTPS_PROXY: 'http://127.0.0.1:3128',
      NODE_EXTRA_CA_CERTS: '/etc/proxy-ca.pem',
      ANTHROPIC_API_KEY: 'caller-key',
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
    CLAUDE_CODE_OAUTH_TOKEN: 'placeholder-token',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  });
});

test('it refuses an environment with no token', () => {
  expect(() => buildContractEnv({ PATH: '/usr/bin' }, '/tmp/contract-config')).toThrowWithMessage(
    Error,
    /needs CLAUDE_CODE_OAUTH_TOKEN/u,
  );
});

test('it refuses an empty token', () => {
  expect(() =>
    buildContractEnv({ CLAUDE_CODE_OAUTH_TOKEN: '', PATH: '/usr/bin' }, '/tmp/contract-config'),
  ).toThrowWithMessage(Error, /needs CLAUDE_CODE_OAUTH_TOKEN/u);
});
