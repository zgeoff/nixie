import { expect, test } from 'bun:test';
import type { LogFields } from '@heynixie/logger';
import { refuseFetchURL } from './refuse-fetch-url';
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

  return { scan, logged, asked };
}

test('it refuses a URL that holds a secret, with the rule and no URL in the sentence', async () => {
  const ctx = setupTest();

  const refusal = await refuseFetchURL('https://site.test/?k=marked', ctx.scan);

  expect(refusal).toBe('the URL holds a secret (rule test-rule), so it was not fetched');
});

test('it logs one event with the rule and hop 0 and nothing else', async () => {
  const ctx = setupTest();

  await refuseFetchURL('https://site.test/?k=marked', ctx.scan);

  expect(ctx.logged).toStrictEqual([
    { event: 'web_fetch.secret_refused', fields: { rule: 'test-rule', hop: 0 } },
  ]);
});

test('it passes a URL that holds no secret, and asks no exemption', async () => {
  const ctx = setupTest();

  const refusal = await refuseFetchURL('https://site.test/', ctx.scan);

  expect(refusal).toBeNull();
  expect(ctx.asked).toStrictEqual([]);
});

test('it passes an exempt URL that holds a secret, and logs nothing', async () => {
  const ctx = setupTest({ isExempt: () => Promise.resolve(true) });

  const refusal = await refuseFetchURL('https://site.test/?k=marked', ctx.scan);

  expect(refusal).toBeNull();
  expect(ctx.logged).toStrictEqual([]);
});

test('it asks the exemption about hop 0', async () => {
  const ctx = setupTest();

  await refuseFetchURL('https://site.test/?k=marked', ctx.scan);

  expect(ctx.asked).toStrictEqual([0]);
});
