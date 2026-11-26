import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildTestFetching, toTestIntegrity } from './build-test-fetching';

function setupTest() {
  const clock = createFakeClock({ startMs: 0 });

  return buildTestFetching({ clock, allowedHosts: ['tides.example'] });
}

test('it answers the registry document of a package it holds, with the integrity of its files', async () => {
  const ctx = setupTest();

  ctx.addPackage('chart.js@4.4.6', { files: { 'a.js': '1' } });

  const reply = await ctx.fetching.readBody('https://registry.test/chart.js/4.4.6');

  expect(reply).toMatchObject({
    kind: 'body',
    status: 200,
    text: expect.stringContaining(toTestIntegrity({ 'a.js': '1' })),
  });
});

test('it refuses a tarball whose integrity is not the one asked for', async () => {
  const ctx = setupTest();

  ctx.addPackage('chart.js@4.4.6', { files: { 'a.js': '1' } });

  const reply = await ctx.fetching.readPackage(
    'https://registry.test/chart.js/-/chart.js-4.4.6.tgz',
    { kind: 'package', integrity: 'sha512-other', unpackedBytes: 100 },
  );

  expect(reply.kind).toBe('refused');
});

test('it lets each host the test allowed pass the rules check, and no other', async () => {
  const ctx = setupTest();

  const results = await Promise.all([
    ctx.fetching.checkHosts(1, ['tides.example']),
    ctx.fetching.checkHosts(1, ['tides.example', 'other.example']),
  ]);

  expect(results).toStrictEqual([true, false]);
});
