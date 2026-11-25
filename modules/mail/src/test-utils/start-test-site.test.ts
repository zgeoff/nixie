import { expect, test } from 'bun:test';
import { startTestSite } from './start-test-site';

test('it answers a path with the text the test gave and records the request', async () => {
  const site = startTestSite({ '/reset': 'Choose a new password.' });

  const response = await fetch(`${site.origin}/reset?token=t0k3n`);

  expect([response.status, await response.text(), site.requests]).toStrictEqual([
    200,
    'Choose a new password.',
    ['/reset?token=t0k3n'],
  ]);
});

test('it answers a path the test gave nothing for with a 404', async () => {
  const site = startTestSite({});

  const response = await fetch(`${site.origin}/other`);

  expect(response.status).toBe(404);
});
