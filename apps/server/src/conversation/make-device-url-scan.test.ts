import { expect, test } from 'bun:test';
import type { LogFields } from '@heynixie/logger';
import { makeSecretFinder } from '@heynixie/secret-scan';
import { buildKey } from '@heynixie/secret-scan/test-utils';
import { makeDeviceURLScan } from './make-device-url-scan';

function setupTest() {
  const logged: { event: string; fields: LogFields | undefined }[] = [];

  const scan = makeDeviceURLScan({
    findSecret: makeSecretFinder(() => []),
    logger: (event, fields) => {
      logged.push({ event, fields });
    },
  });

  return { logged, scan };
}

test('#makeDeviceURLScan refuses a URL that holds a key, without naming the key, and logs one event', () => {
  const ctx = setupTest();

  const refusal = ctx.scan(
    `https://api.example.test/v1/items?id=ghp_${buildKey('alphanumeric', 36)}`,
  );

  expect(refusal).toBe('the URL holds a secret (rule github-pat), so it was not fetched');

  expect(ctx.logged).toStrictEqual([
    { event: 'device_fetch.secret_refused', fields: { rule: 'github-pat' } },
  ]);
});

test('#makeDeviceURLScan passes a URL that holds no secret and logs nothing', () => {
  const ctx = setupTest();
  const refusal = ctx.scan('https://tides.example/today?day=mon');

  expect(refusal).toBeNull();
  expect(ctx.logged).toStrictEqual([]);
});
