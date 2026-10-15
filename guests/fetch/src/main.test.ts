import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'fetch-main-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it answers one request in a process of its own and leaves its temporary directory behind it removed', async () => {
  const ctx = await setupTest();

  const fetcher = Bun.spawn([process.execPath, join(import.meta.dir, 'main.ts')], {
    env: { PATH: process.env['PATH'] ?? '', TMPDIR: ctx.root },
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://localhost/',
        limits: { bodyBytes: 1000, timeoutMs: 5000, redirects: 1, textBytes: 1000 },
        deniedRanges: [],
      }),
    ),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  onTestFinished(() => {
    fetcher.kill('SIGKILL');
  });

  const [code, stdout] = await Promise.all([fetcher.exited, new Response(fetcher.stdout).bytes()]);
  const left = await readdir(ctx.root);

  expect(code).toBe(0);

  expect(
    makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message)),
  ).toStrictEqual([
    {
      kind: 'refused',
      reason: expect.toBeOneOf([
        'localhost resolves to 127.0.0.1, which is not a public address',
        'localhost resolves to ::1, which is not a public address',
      ]),
    },
  ]);

  expect(left).toStrictEqual([]);
});

test('it exits non-zero with no reply for a malformed request', async () => {
  const ctx = await setupTest();

  const fetcher = Bun.spawn([process.execPath, join(import.meta.dir, 'main.ts')], {
    env: { PATH: process.env['PATH'] ?? '', TMPDIR: ctx.root },
    stdin: encodeFrame(new TextEncoder().encode('{"url":"https://example.com/"}')),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  onTestFinished(() => {
    fetcher.kill('SIGKILL');
  });

  const [code, stdout] = await Promise.all([fetcher.exited, new Response(fetcher.stdout).bytes()]);
  const left = await readdir(ctx.root);

  expect(code).not.toBe(0);
  expect(stdout).toHaveLength(0);
  expect(left).toStrictEqual([]);
});
