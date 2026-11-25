import { expect, test } from 'bun:test';
import { mailConfigSchema } from './mail-config-schema';

test('it reads the address and takes the default poll interval', () => {
  const config = mailConfigSchema.parse({ address: 'assistant@nixie.example.org' });

  expect(config).toStrictEqual({
    address: 'assistant@nixie.example.org',
    host_poll_interval: 30_000,
  });
});

test('it reads the poll interval as a duration', () => {
  const config = mailConfigSchema.parse({
    address: 'assistant@nixie.example.org',
    host_poll_interval: '2m',
  });

  expect(config.host_poll_interval).toBe(120_000);
});

test.each([
  ['an address that is no address', { address: 'assistant' }],
  ['an interval that is no duration', { address: 'a@x.example.org', host_poll_interval: 'soon' }],
  ['a key it does not know', { address: 'a@x.example.org', domain: 'x.example.org' }],
])('it refuses %s', (_name, config) => {
  expect(mailConfigSchema.safeParse(config).success).toBe(false);
});
