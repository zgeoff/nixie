import { expect, test } from 'bun:test';
import { phoneConfigSchema } from './phone-config-schema';

test('it reads a number and a poll interval, which defaults to 20 seconds', () => {
  const config = phoneConfigSchema.parse({ number: '+61411111111' });

  expect(config).toStrictEqual({ number: '+61411111111', poll_interval: 20_000 });
});

test('it reads a poll interval in the shared duration text', () => {
  const config = phoneConfigSchema.parse({ number: '+61411111111', poll_interval: '1m' });

  expect(config.poll_interval).toBe(60_000);
});

test.each(['0411111111', '+0411111111', '+6141', 'Example'])(
  'it refuses the number %s, which is not in E.164 form',
  (number) => {
    expect(phoneConfigSchema.safeParse({ number }).success).toBe(false);
  },
);

test('it refuses a key it does not read, such as the adapter section', () => {
  expect(phoneConfigSchema.safeParse({ number: '+61411111111', twilio: {} }).success).toBe(false);
});
