import { expect, test } from 'bun:test';
import { parseLiveEnv } from './parse-live-env';

test('it leaves every value null when no variable is set', () => {
  expect(parseLiveEnv({})).toStrictEqual({
    url: null,
    kubectl: null,
    rollImage: null,
    impdToken: null,
    tailnetTarget: null,
  });
});

test('it reads every variable', () => {
  expect(
    parseLiveEnv({
      NIXIE_LIVE_URL: 'https://nixie.example.com/',
      NIXIE_LIVE_KUBECONFIG: '/tmp/kubeconfig',
      NIXIE_LIVE_KUBECTL: '/usr/local/bin/kubectl',
      NIXIE_LIVE_NAMESPACE: 'assistant',
      NIXIE_LIVE_ROLL_IMAGE: `ghcr.io/zgeoff/nixie:0.1.1@sha256:${'a'.repeat(64)}`,
      NIXIE_LIVE_IMPD_TOKEN: 'impd-token',
      NIXIE_LIVE_TAILNET_TARGET: '100.64.0.1:80',
    }),
  ).toStrictEqual({
    url: 'https://nixie.example.com',
    kubectl: {
      argv: ['/usr/local/bin/kubectl'],
      kubeconfig: '/tmp/kubeconfig',
      namespace: 'assistant',
    },
    rollImage: `ghcr.io/zgeoff/nixie:0.1.1@sha256:${'a'.repeat(64)}`,
    impdToken: 'impd-token',
    tailnetTarget: { host: '100.64.0.1', port: 80 },
  });
});

test('it runs kubectl from the path in the nixie namespace by default', () => {
  expect(parseLiveEnv({ NIXIE_LIVE_KUBECONFIG: '/tmp/kubeconfig' }).kubectl).toStrictEqual({
    argv: ['kubectl'],
    kubeconfig: '/tmp/kubeconfig',
    namespace: 'nixie',
  });
});

test('it treats an empty variable as unset', () => {
  expect(parseLiveEnv({ NIXIE_LIVE_URL: '  ', NIXIE_LIVE_KUBECONFIG: '' })).toMatchObject({
    url: null,
    kubectl: null,
  });
});

test('it refuses a URL that is not http or https', () => {
  expect(() => parseLiveEnv({ NIXIE_LIVE_URL: 'ftp://nixie.example.com' })).toThrowWithMessage(
    Error,
    'NIXIE_LIVE_URL must be an http or https URL, not ftp://nixie.example.com',
  );
});

test('it refuses a roll image that names no digest', () => {
  expect(() =>
    parseLiveEnv({ NIXIE_LIVE_ROLL_IMAGE: 'ghcr.io/zgeoff/nixie:0.1.1' }),
  ).toThrowWithMessage(
    Error,
    'NIXIE_LIVE_ROLL_IMAGE must name an image by its digest, not ghcr.io/zgeoff/nixie:0.1.1',
  );
});

test('it reads an IPv6 tailnet target in brackets', () => {
  expect(
    parseLiveEnv({ NIXIE_LIVE_TAILNET_TARGET: '[fd7a:115c:a1e0::5]:8080' }).tailnetTarget,
  ).toStrictEqual({
    host: 'fd7a:115c:a1e0::5',
    port: 8080,
  });
});

test.each([['100.64.0.1'], ['tailnet-host:80'], ['100.64.0.1:0'], ['999.1.1.1:80']])(
  'it refuses the tailnet target %s',
  (value) => {
    expect(() => parseLiveEnv({ NIXIE_LIVE_TAILNET_TARGET: value })).toThrowWithMessage(
      Error,
      `NIXIE_LIVE_TAILNET_TARGET must be an address and a port, not ${value}`,
    );
  },
);
