import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSocketProxy } from '@heynixie/egress';
import type { ComputerRequest } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { makeShellHandler } from './make-shell-handler';
import { ownAccount } from './terminal-account';

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
  const refusal: { reason: string | null } = { reason: null };
  let isNew = true;
  const proxySocketPath = join(base, 'proxy.sock');

  const proxy = await startSocketProxy(
    {
      checkAddress: () => true,
      resolveHost: () => Promise.resolve(['127.0.0.1']),
      scanURL: (url) => {
        scanned.push(url);

        return refusal.reason === null
          ? Promise.resolve()
          : Promise.reject(new Error(refusal.reason));
      },
      scanText: (text) => {
        scannedTexts.push(text);

        return text.includes('synthetic-secret')
          ? Promise.reject(new Error('holds a secret'))
          : Promise.resolve();
      },
      canTunnel: false,
    },
    proxySocketPath,
  );

  onTestFinished(async () => {
    await proxy.stop();
  });

  const handle = makeShellHandler({
    root,
    baseEnv: { PATH: process.env['PATH'] ?? '', HOME: base },
    account: ownAccount,
    proxySocketPath,
    bridgeScript: join(import.meta.dir, 'bridge-main.ts'),
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
    send: (request: ComputerRequest, refuse?: string) => {
      refusal.reason = refuse ?? null;

      return handle(
        request,
        () => Promise.resolve(),
        () => Promise.resolve(),
      );
    },
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

  invariant(reply.kind === 'run');

  expect(reply.run.exitCode).toBe(0);
  expect(reply.run.stdout.text).not.toInclude('DIRECT_CONNECTION');
  expect(reply.run.stdout.text).not.toMatch(/curl=0|raw=0/u);
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

test('it gives a command no route to a socket in the guest network namespace, such as the display', async () => {
  const ctx = await setupTest();

  const accepted: string[] = [];

  const listener = Bun.listen({
    unix: '\0nixie-test-display',
    socket: {
      open: () => {
        accepted.push('connection');
      },
      data: () => {},
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  const script = `import { connect } from 'node:net'; const socket = connect({ path: '\\0nixie-test-display' }); socket.on('connect', () => { console.log('reached'); process.exit(0); }); socket.on('error', () => { console.log('unreachable'); process.exit(0); });`;

  const reply = await ctx.send({
    op: 'run',
    argv: [process.execPath, '-e', script],
    timeoutSeconds: 20,
  });

  invariant(reply.kind === 'run');

  expect({ stdout: reply.run.stdout.text, accepted }).toStrictEqual({
    stdout: 'unreachable\n',
    accepted: [],
  });
});

test('it shows a command only its own processes in ps and /proc', async () => {
  const ctx = await setupTest();

  const outside = Bun.spawn(['sleep', '4242']);

  onTestFinished(() => {
    outside.kill();
  });

  const reply = await ctx.send({
    op: 'run',
    argv: ['bash', '-c', String.raw`ps -e -o args=; echo ---; tr "\0" " " < /proc/1/cmdline`],
    timeoutSeconds: 20,
  });

  invariant(reply.kind === 'run');

  const [processes = '', firstProcess = ''] = reply.run.stdout.text.split('---\n');

  expect(reply.run.exitCode).toBe(0);
  expect(processes).not.toInclude('sleep 4242');
  expect(processes).not.toInclude(String(process.pid));
  expect(firstProcess).toInclude('bridge-main.ts');
});
