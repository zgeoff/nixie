import { expect, test } from 'bun:test';
import { buildStubResolver, startTestSite } from '@heynixie/egress/test-utils';
import type { FetchMode } from '@heynixie/wire';
import { createWebTransports } from '../page/create-web-transports';
import { readPage } from '../page/read-page';
import { buildIntegrity, buildPackageTarball } from '../test-utils/build-package-tarball';

async function setupTest(respond: (request: Request) => Response) {
  const site = await startTestSite({ names: ['registry.test'], respond });

  const resolver = buildStubResolver({ answers: { 'registry.test': [['127.0.0.1']] } });

  return {
    site,
    read: (mode: FetchMode) =>
      readPage(`https://registry.test:${site.port}/chart.js/-/chart.js-4.4.6.tgz`, {
        limits: {
          bodyBytes: 1_000_000,
          timeoutMs: 5000,
          redirects: 2,
          textBytes: 1_000_000,
          imageBytes: 1_000_000,
        },
        checkAddress: (address: string) => address === '127.0.0.1',
        resolveHost: resolver.resolveHost,
        transports: createWebTransports(),
        ca: site.ca,
        mode,
      }),
  };
}

test('it unpacks a tarball that matches the approved integrity', async () => {
  const tarball = buildPackageTarball([{ path: 'package/dist/a.js', content: 'var a;' }]);

  const ctx = await setupTest(() => new Response(tarball));

  const reply = await ctx.read({
    kind: 'package',
    integrity: buildIntegrity(tarball),
    unpackedBytes: 1000,
  });

  expect(reply).toMatchObject({
    kind: 'package',
    files: [{ path: 'dist/a.js', base64: Buffer.from('var a;').toString('base64') }],
  });
});

test('it refuses a tarball whose hash differs from the approved integrity', async () => {
  const approved = buildPackageTarball([{ path: 'package/a.js', content: 'good' }]);
  const served = buildPackageTarball([{ path: 'package/a.js', content: 'evil' }]);

  const ctx = await setupTest(() => new Response(served));

  const reply = await ctx.read({
    kind: 'package',
    integrity: buildIntegrity(approved),
    unpackedBytes: 1000,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'the tarball does not match the integrity hash that was approved',
    isGated: false,
  });
});

test('it returns the text of a body with no reading of its HTML', async () => {
  const ctx = await setupTest(
    () => new Response('<b>raw</b>', { headers: { 'content-type': 'application/json' } }),
  );

  const reply = await ctx.read({ kind: 'body' });

  expect(reply).toMatchObject({
    kind: 'body',
    status: 200,
    contentType: 'application/json',
    text: '<b>raw</b>',
    isTruncated: false,
  });
});
