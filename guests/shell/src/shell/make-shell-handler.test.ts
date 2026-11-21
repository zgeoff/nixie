import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComputerRequest } from '@heynixie/wire';
import { makeShellHandler } from './make-shell-handler';

async function setupTest() {
  const made = await mkdtemp(join(tmpdir(), 'shell-'));
  const base = await realpath(made);

  onTestFinished(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const root = join(base, 'files');

  await mkdir(root);

  const scanned: string[] = [];
  const scannedTexts: string[] = [];
  let isNew = true;

  const handle = makeShellHandler({
    root,
    baseEnv: { PATH: process.env['PATH'] ?? '', HOME: base },
    bridgeScript: join(import.meta.dir, 'bridge-main.ts'),
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    takeIsDiskNew: () => {
      const was = isNew;

      isNew = false;

      return Promise.resolve(was);
    },
  });

  return {
    root,
    scanned,
    scannedTexts,
    send: (request: ComputerRequest, refuse?: string) =>
      handle(
        request,
        (url) => {
          scanned.push(url);

          return refuse === undefined ? Promise.resolve() : Promise.reject(new Error(refuse));
        },
        (text) => {
          scannedTexts.push(text);

          return text.includes('synthetic-secret')
            ? Promise.reject(new Error('holds a secret'))
            : Promise.resolve();
        },
      ),
  };
}

test('it runs a command in the files folder and marks the first use of an empty disk', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send({ op: 'run', argv: ['bash', '-lc', 'pwd'], timeoutSeconds: 10 });

  expect(reply).toMatchObject({
    kind: 'run',
    run: {
      exitCode: 0,
      stdout: { text: `${ctx.root}\n`, isCut: false },
      stderr: { text: '', isCut: false },
      isDiskNew: true,
    },
  });
});

test('it reports a non-zero exit code and the stderr of the command', async () => {
  const ctx = await setupTest();

  const reply = await ctx.send({
    op: 'run',
    argv: ['bash', '-c', 'echo oops >&2; exit 3'],
    timeoutSeconds: 10,
  });

  expect(reply).toMatchObject({
    run: { exitCode: 3, stderr: { text: 'oops\n' }, isDiskNew: true },
  });
});

test('it kills a command at its time limit and reports no exit code', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send({ op: 'run', argv: ['bash', '-c', 'sleep 30'], timeoutSeconds: 1 });

  expect(reply).toMatchObject({ kind: 'run', run: { exitCode: null } });
});

test('it writes a file with its folders and reads it back', async () => {
  const ctx = await setupTest();

  const base64 = Buffer.from('hello').toString('base64');

  const written = await ctx.send({ op: 'writeFile', path: '~/files/a/b/notes.md', base64 });
  const read = await ctx.send({ op: 'readFile', path: 'a/b/notes.md' });

  expect(written).toMatchObject({ kind: 'written', bytes: 5 });
  expect(read).toMatchObject({ kind: 'file', name: 'notes.md', base64 });

  const text = await readFile(join(ctx.root, 'a/b/notes.md'), 'utf8');

  expect(text).toBe('hello');
});

test.each(['../x', '/etc/passwd', '~/files/../x'])(
  'it refuses to write the path %s outside the files folder',
  async (path) => {
    const ctx = await setupTest();
    const reply = await ctx.send({ op: 'writeFile', path, base64: '' });

    expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'bad_path' });
  },
);

test('it answers no_file for a file that is not there', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send({ op: 'readFile', path: 'nothing.txt' });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'no_file' });
});

test('it sends every connection of a command through the proxy and scans its URL', async () => {
  const ctx = await setupTest();

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: { '/*': new Response('page') },
  });

  onTestFinished(async () => {
    await site.stop(true);
  });

  const url = `http://pages.test:${String(site.port)}/hello`;

  const reply = await ctx.send({
    op: 'run',
    argv: ['bash', '-c', `curl -s ${url}`],
    timeoutSeconds: 20,
  });

  expect(reply).toMatchObject({ run: { exitCode: 0, stdout: { text: 'page' } } });
  expect(ctx.scanned).toStrictEqual([url]);
});

test('it stops a connection whose URL the scan refuses', async () => {
  const ctx = await setupTest();

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: { '/*': new Response('page') },
  });

  onTestFinished(async () => {
    await site.stop(true);
  });

  const reply = await ctx.send(
    {
      op: 'run',
      argv: [
        'bash',
        '-c',
        `curl -s -o /dev/null -w '%{http_code}' http://pages.test:${String(site.port)}/`,
      ],
      timeoutSeconds: 20,
    },
    'holds a secret',
  );

  expect(reply).toMatchObject({ run: { stdout: { text: '403' } } });
});

test('it gives a command no route out except the proxy', async () => {
  const ctx = await setupTest();

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: { '/*': new Response('DIRECT_CONNECTION') },
  });

  onTestFinished(async () => {
    await site.stop(true);
  });

  const reply = await ctx.send({
    op: 'run',
    argv: [
      'bash',
      '-c',
      `curl -s --noproxy '*' --max-time 5 http://127.0.0.1:${String(site.port)}/; echo "curl=$?"; (exec 3<>/dev/tcp/127.0.0.1/${String(site.port)}) 2>/dev/null; echo "raw=$?"`,
    ],
    timeoutSeconds: 20,
  });

  expect(reply).toMatchObject({
    run: { exitCode: 0, stdout: { text: expect.not.stringContaining('DIRECT_CONNECTION') } },
  });

  expect(reply).toMatchObject({
    run: { stdout: { text: expect.not.stringMatching(/curl=0|raw=0/u) } },
  });

  expect(ctx.scanned).toStrictEqual([]);
});

test('it stops a body that holds a secret the URL does not', async () => {
  const ctx = await setupTest();

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: { '/*': new Response('received') },
  });

  onTestFinished(async () => {
    await site.stop(true);
  });

  await Bun.write(join(ctx.root, 'upload.txt'), 'synthetic-secret');

  const reply = await ctx.send({
    op: 'run',
    argv: [
      'bash',
      '-c',
      `curl -s -o /dev/null -w '%{http_code}' --data-binary @upload.txt http://pages.test:${String(site.port)}/up`,
    ],
    timeoutSeconds: 20,
  });

  expect(reply).toMatchObject({ run: { stdout: { text: '403' } } });
});

test('it stops a header that holds a secret', async () => {
  const ctx = await setupTest();

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: { '/*': new Response('received') },
  });

  onTestFinished(async () => {
    await site.stop(true);
  });

  const reply = await ctx.send({
    op: 'run',
    argv: [
      'bash',
      '-c',
      `curl -s -o /dev/null -w '%{http_code}' -H 'X-Note: synthetic-secret' http://pages.test:${String(site.port)}/up`,
    ],
    timeoutSeconds: 20,
  });

  expect(reply).toMatchObject({ run: { stdout: { text: '403' } } });
});

test('it refuses an encrypted tunnel a command opens', async () => {
  const ctx = await setupTest();

  const reply = await ctx.send({
    op: 'run',
    argv: ['bash', '-c', `curl -s -o /dev/null -w '%{http_code}' https://pages.test:9/`],
    timeoutSeconds: 20,
  });

  expect(reply).toMatchObject({ run: { stdout: { text: '000' } } });
  expect(ctx.scanned).toStrictEqual([]);
});
