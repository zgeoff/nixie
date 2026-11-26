import { expect, onTestFinished, test } from 'bun:test';
import { startDeviceTestSite } from './start-device-test-site';

function setupTest() {
  const site = startDeviceTestSite();

  onTestFinished(() => site.stop());

  return { site };
}

test('it serves the tide page with the high tide its query names', async () => {
  const ctx = setupTest();

  const plain = await fetch(`${ctx.site.url}today`);
  const queried = await fetch(`${ctx.site.url}today?high=15:40`);
  const plainBody = await plain.json();
  const queriedBody = await queried.json();

  expect([plainBody, queriedBody]).toStrictEqual([{ high: '14:05' }, { high: '15:40' }]);
});

test('it serves the registry document of ripple-count 1.0.0 with the integrity of its tarball', async () => {
  const ctx = setupTest();

  const document = await fetch(`${ctx.site.url}ripple-count/1.0.0`);
  const tarball = await fetch(`${ctx.site.url}ripple-count/-/ripple-count-1.0.0.tgz`);
  const bytes = await tarball.bytes();
  const body = await document.json();

  const hash = new Bun.CryptoHasher('sha512').update(bytes).digest('base64');

  expect(body).toMatchObject({
    name: 'ripple-count',
    dist: { integrity: `sha512-${hash}` },
  });
});

test('it answers 404 for any other path', async () => {
  const ctx = setupTest();

  const missing = await fetch(`${ctx.site.url}other`);

  expect(missing.status).toBe(404);
});
