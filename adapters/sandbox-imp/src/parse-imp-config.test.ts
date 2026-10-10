import { expect, test } from 'bun:test';
import { parseImpConfig } from './parse-imp-config';

test('it takes the public egress ranges from the deployment', () => {
  const config = parseImpConfig({
    IMP_URL: 'https://impd.example',
    IMP_TOKEN: 'token',
    IMP_HOST_ADDRESSES: '203.0.113.7/24, 2001:db8::7/64',
    IMP_EGRESS_DENY: '198.51.100.0/24',
  });

  expect(config).toStrictEqual({
    url: 'https://impd.example',
    token: 'token',
    publicEgress: {
      hostAddresses: ['203.0.113.7/24', '2001:db8::7/64'],
      egressDeny: ['198.51.100.0/24'],
    },
  });
});

test('it leaves public egress off without host addresses', () => {
  const config = parseImpConfig({ IMP_URL: 'http://localhost:7070', IMP_TOKEN: 'token' });

  expect(config.publicEgress).toBeNull();
});

test.each([
  [{ IMP_TOKEN: 'token' }, "IMP_URL must be impd's http or https URL"],
  [{ IMP_URL: 'http://localhost:7070' }, 'IMP_TOKEN must hold an impd token'],
  [
    { IMP_URL: 'http://localhost:7070', IMP_TOKEN: 't', IMP_HOST_ADDRESSES: 'host.example' },
    'IMP_HOST_ADDRESSES holds host.example, which is not an address or a network',
  ],
])('it refuses a config it cannot use: %#', (env, message) => {
  expect(() => parseImpConfig(env)).toThrow(message);
});
