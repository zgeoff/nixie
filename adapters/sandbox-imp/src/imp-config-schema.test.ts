import { expect, test } from 'bun:test';
import { impConfigSchema } from './imp-config-schema';

test('it takes the public egress ranges from the deployment', () => {
  const result = impConfigSchema.safeParse({
    url: 'https://impd.example',
    host_addresses: ['203.0.113.7/24', '2001:db8::7/64'],
    egress_deny: ['198.51.100.0/24'],
  });

  expect(result.data).toStrictEqual({
    url: 'https://impd.example',
    publicEgress: {
      hostAddresses: ['203.0.113.7/24', '2001:db8::7/64'],
      egressDeny: ['198.51.100.0/24'],
    },
  });
});

test('it leaves public egress off without host addresses', () => {
  const result = impConfigSchema.safeParse({ url: 'http://localhost:7070' });

  expect(result.data).toStrictEqual({ url: 'http://localhost:7070', publicEgress: null });
});

test('it refuses a host address that is not an address or a network', () => {
  const result = impConfigSchema.safeParse({
    url: 'http://localhost:7070',
    host_addresses: ['host.example'],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['host_addresses', 0] });
});

test('it refuses a token, which belongs in the secrets file', () => {
  const result = impConfigSchema.safeParse({ url: 'http://localhost:7070', token: 'secret' });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys', keys: ['token'] });
});

test('it refuses a url that is not http or https', () => {
  const result = impConfigSchema.safeParse({ url: 'ftp://impd.example' });

  expect(result.error?.issues).toPartiallyContain({ path: ['url'] });
});
