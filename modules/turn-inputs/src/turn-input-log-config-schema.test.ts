import { expect, test } from 'bun:test';
import { turnInputLogConfigSchema } from './turn-input-log-config-schema';

test('it fills the defaults of an empty section', () => {
  expect(turnInputLogConfigSchema.parse({})).toStrictEqual({
    default: 'always',
    maxWindowMs: 86_400_000,
    closeWaitMs: 5000,
    roles: ['conversation', 'task'],
    retention: { days: 7, bytes: 2_147_483_648 },
    sources: {},
  });
});

test('it reads a source with its base URL and its folder', () => {
  const parsed = turnInputLogConfigSchema.parse({
    close_wait: '500ms',
    sources: {
      // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the key of the deployment's config
      gateway: { base_url: 'https://gw.example.test', dir: '/var/spool/x' },
    },
  });

  expect(parsed.sources).toStrictEqual({
    gateway: { baseURL: 'https://gw.example.test', directory: '/var/spool/x' },
  });

  expect(parsed.closeWaitMs).toBe(500);
});

test.each(['checker', 'worker'])('it refuses the %s role with a reason', (role) => {
  expect(turnInputLogConfigSchema.safeParse({ roles: [role] }).success).toBeFalse();
});

test('it refuses a retention of 5 days', () => {
  expect(turnInputLogConfigSchema.safeParse({ retention: { days: 5 } }).success).toBeFalse();
});

test('it refuses a relative folder and a non-http base URL', () => {
  expect(
    turnInputLogConfigSchema.safeParse({
      sources: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the key of the deployment's config
        gateway: { base_url: 'ftp://gw.example.test', dir: 'spool' },
      },
    }).success,
  ).toBeFalse();
});

test('it refuses an unknown duration', () => {
  expect(turnInputLogConfigSchema.safeParse({ max_window: 'soon' }).success).toBeFalse();
});
