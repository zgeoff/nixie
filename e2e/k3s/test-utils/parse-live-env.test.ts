import { expect, test } from 'bun:test';
import { parseLiveEnv } from './parse-live-env';

test('it leaves every value null when no variable is set', () => {
  expect(parseLiveEnv({})).toStrictEqual({
    url: null,
    kubectl: null,
    rollImage: null,
    impdToken: null,
    tailnetAddress: '100.100.100.100',
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
      NIXIE_LIVE_TAILNET_ADDRESS: '100.64.0.1',
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
    tailnetAddress: '100.64.0.1',
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
