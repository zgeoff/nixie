import { expect, test } from 'bun:test';
import type { LogFields } from '@heynixie/logger';
import { makeHopScan } from './make-hop-scan';
import type { SecretScan } from './secret-scan';

function setupTest(overrides: Partial<SecretScan> = {}) {
  const logged: { event: string; fields: LogFields | undefined }[] = [];
  const asked: number[] = [];

  const scan: SecretScan = {
    findSecret: (url) => (url.includes('marked') ? { rule: 'test-rule' } : null),
    isExempt: (hop) => {
      asked.push(hop);

      return Promise.resolve(false);
    },
    logger: (event, fields) => {
      logged.push({ event, fields });
    },
    ...overrides,
  };

  return { scanHop: makeHopScan(scan), logged, asked };
}

test('it refuses a hop whose URL holds a secret, naming the host that sent the redirect', async () => {
  const ctx = setupTest();

  const verdict = await ctx.scanHop({
    number: 1,
    url: 'https://www.site.test/?k=marked',
    sentBy: 'site.test',
  });

  expect(verdict).toStrictEqual({
    kind: 'refuse',
    reason:
      'site.test redirected to a URL that holds a secret (rule test-rule), so it was not fetched',
  });
});

test('it names no host when the finder matches the host that sent the redirect', async () => {
  const ctx = setupTest();

  const verdict = await ctx.scanHop({
    number: 2,
    url: 'https://other.test/?k=marked',
    sentBy: 'marked.site.test',
  });

  expect(verdict).toStrictEqual({
    kind: 'refuse',
    reason:
      'a site redirected to a URL that holds a secret (rule test-rule), so it was not fetched',
  });
});

test('it logs one event with the rule and the hop number and nothing else', async () => {
  const ctx = setupTest();

  await ctx.scanHop({ number: 3, url: 'https://x.test/?k=marked', sentBy: 'site.test' });

  expect(ctx.logged).toStrictEqual([
    { event: 'web_fetch.secret_refused', fields: { rule: 'test-rule', hop: 3 } },
  ]);
});

test('it passes a hop that holds no secret, and asks no exemption', async () => {
  const ctx = setupTest();

  const verdict = await ctx.scanHop({ number: 1, url: 'https://x.test/', sentBy: 'site.test' });

  expect(verdict).toStrictEqual({ kind: 'pass' });
  expect(ctx.asked).toStrictEqual([]);
});

test('it passes an exempt hop that holds a secret, and logs nothing', async () => {
  const ctx = setupTest({ isExempt: () => Promise.resolve(true) });

  const verdict = await ctx.scanHop({
    number: 1,
    url: 'https://x.test/?k=marked',
    sentBy: 'site.test',
  });

  expect(verdict).toStrictEqual({ kind: 'pass' });
  expect(ctx.logged).toStrictEqual([]);
});

test('it asks the exemption about the hop number', async () => {
  const ctx = setupTest();

  await ctx.scanHop({ number: 4, url: 'https://x.test/?k=marked', sentBy: 'site.test' });

  expect(ctx.asked).toStrictEqual([4]);
});
