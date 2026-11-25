import { expect, test } from 'bun:test';
import { wakeRulesConfigSchema } from './wake-rules-config-schema';

test('#wakeRulesConfigSchema reads the defaults for a section that sets nothing', () => {
  expect(wakeRulesConfigSchema.parse({})).toStrictEqual({
    window: 900_000,
    reply_expiry: 604_800_000,
  });
});

test.each([
  ['a window under a minute', { window: '1ms' }],
  ['a window over 3650 days', { window: '3651d', reply_expiry: '3650d' }],
  ['a reply expiry under a minute', { reply_expiry: '59s' }],
  ['a reply expiry that no safe integer holds', { reply_expiry: '999999999d' }],
  ['a window past the reply expiry', { window: '2d', reply_expiry: '1d' }],
])('#wakeRulesConfigSchema rejects %s', (_name, section) => {
  expect(wakeRulesConfigSchema.safeParse(section).success).toBe(false);
});
