import { expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';

test('it answers a page whose text holds the bytes the URL names', async () => {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://pages.test/files/12',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100 },
        deniedRanges: [],
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toStrictEqual([
    {
      kind: 'page',
      url: 'https://pages.test/files/12',
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      text: 'xxxxxxxxxxxx',
      links: [],
      isTruncated: false,
      blocked: null,
    },
  ]);
});

test("it cuts the text at the request's text limit and marks it truncated, as the fetcher does", async () => {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://pages.test/files/12',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 5 },
        deniedRanges: [],
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toMatchObject([{ kind: 'page', text: 'xxxxx', isTruncated: true }]);
});
