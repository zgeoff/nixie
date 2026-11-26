import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildIntegrity, buildPackageTarball } from '@heynixie/testing';
import {
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import type { FetchRequest } from '@heynixie/wire';

function setupTest() {
  const entry = join(import.meta.dir, 'run-site-fetcher.ts');

  return {
    limits: { bodyBytes: 1000, timeoutMs: 5000, redirects: 3, textBytes: 1000, imageBytes: 0 },
    startSite: (answer: (url: URL) => Response) => {
      const site = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        routes: { '/*': (request) => answer(new URL(request.url)) },
      });

      onTestFinished(() => site.stop(true));

      return `http://127.0.0.1:${String(site.port)}/`;
    },
    ask: async (siteURL: string, request: FetchRequest) => {
      const child = Bun.spawn([process.execPath, entry, siteURL], {
        stdin: encodeFrame(encodeFetchMessage(request)),
        stdout: 'pipe',
      });

      const stdout = await new Response(child.stdout).bytes();

      return makeFrameDecoder(1_000_000)(stdout).map((message) => decodeFetchReply(message));
    },
  };
}

test('it answers a body request with what the site serves at the path of the URL', async () => {
  const ctx = setupTest();
  const siteURL = ctx.startSite(() => Response.json({ high: '14:05' }));

  const replies = await ctx.ask(siteURL, {
    url: 'https://tides.test/today',
    limits: ctx.limits,
    deniedRanges: [],
    hops: 'none',
    mode: { kind: 'body' },
  });

  expect(replies).toMatchObject([{ kind: 'body', status: 200, text: '{"high":"14:05"}' }]);
});

test('it unpacks the package that the site serves once its integrity matches', async () => {
  const ctx = setupTest();
  const tarball = buildPackageTarball([{ path: 'package/ripples.js', content: 'window.x = 1;' }]);
  const siteURL = ctx.startSite(() => new Response(tarball));

  const replies = await ctx.ask(siteURL, {
    url: 'https://registry.test/ripple/-/ripple-1.0.0.tgz',
    limits: ctx.limits,
    deniedRanges: [],
    hops: 'none',
    mode: { kind: 'package', integrity: buildIntegrity(tarball), unpackedBytes: 1000 },
  });

  expect(replies).toMatchObject([
    {
      kind: 'package',
      files: [{ path: 'ripples.js', base64: Buffer.from('window.x = 1;').toString('base64') }],
    },
  ]);
});

test('it refuses a package whose bytes do not match the integrity that was approved', async () => {
  const ctx = setupTest();
  const tarball = buildPackageTarball([{ path: 'package/ripples.js', content: 'window.x = 1;' }]);
  const other = buildPackageTarball([{ path: 'package/ripples.js', content: 'window.x = 2;' }]);
  const siteURL = ctx.startSite(() => new Response(tarball));

  const replies = await ctx.ask(siteURL, {
    url: 'https://registry.test/ripple/-/ripple-1.0.0.tgz',
    limits: ctx.limits,
    deniedRanges: [],
    hops: 'none',
    mode: { kind: 'package', integrity: buildIntegrity(other), unpackedBytes: 1000 },
  });

  expect(replies).toMatchObject([{ kind: 'refused' }]);
});

test('it fails a request that names no site', async () => {
  const ctx = setupTest();

  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-site-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://tides.test/today',
        limits: ctx.limits,
        deniedRanges: [],
        hops: 'none',
        mode: { kind: 'body' },
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(1_000_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toMatchObject([{ kind: 'failed', reason: 'the site fetcher has no test site' }]);
});
