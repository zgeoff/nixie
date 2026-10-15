import { expect, test } from 'bun:test';
import { pickBrokerEnv } from './pick-broker-env';

test("it picks the broker's proxy, bypass and certificate variables", () => {
  expect(
    pickBrokerEnv({
      HTTPS_PROXY: 'http://10.0.0.5:7081',
      https_proxy: 'http://10.0.0.5:7081',
      HTTP_PROXY: 'http://10.0.0.5:7080',
      http_proxy: 'http://10.0.0.5:7080',
      NO_PROXY: 'localhost',
      no_proxy: 'localhost',
      NODE_USE_ENV_PROXY: '1',
      SSL_CERT_FILE: '/etc/broker/ca.pem',
      NODE_EXTRA_CA_CERTS: '/etc/broker/ca.pem',
    }),
  ).toStrictEqual({
    HTTPS_PROXY: 'http://10.0.0.5:7081',
    https_proxy: 'http://10.0.0.5:7081',
    HTTP_PROXY: 'http://10.0.0.5:7080',
    http_proxy: 'http://10.0.0.5:7080',
    NO_PROXY: 'localhost',
    no_proxy: 'localhost',
    NODE_USE_ENV_PROXY: '1',
    SSL_CERT_FILE: '/etc/broker/ca.pem',
    NODE_EXTRA_CA_CERTS: '/etc/broker/ca.pem',
  });
});

test('it leaves out every other variable of the host', () => {
  expect(
    pickBrokerEnv({ HTTPS_PROXY: 'http://10.0.0.5:7081', HOME: '/root', TOKEN: 'host-only' }),
  ).toStrictEqual({ HTTPS_PROXY: 'http://10.0.0.5:7081' });
});

test('it leaves out a broker variable that is empty', () => {
  expect(pickBrokerEnv({ HTTPS_PROXY: '', SSL_CERT_FILE: undefined })).toStrictEqual({});
});
