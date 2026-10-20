import { expect, mock, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePinnedFiles } from './write-pinned-files';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-pinned-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { outDir: join(directory, 'out') };
}

test('it writes each listed file once its SHA-256 matches the list', async () => {
  const ctx = await setupTest();

  const server = Bun.serve({
    port: 0,
    routes: {
      '/graph.onnx': new Response('a model graph'),
      '/tokenizer.json': new Response('{"model":{}}'),
    },
  });

  onTestFinished(() => server.stop(true));

  const list = [
    '# a comment line',
    `onnx/graph.onnx ${server.url.href}graph.onnx ${createHash('sha256').update('a model graph').digest('hex')}`,
    '',
    `tokenizer.json ${server.url.href}tokenizer.json ${createHash('sha256').update('{"model":{}}').digest('hex')}`,
  ].join('\n');

  const written = await writePinnedFiles(list, ctx.outDir);

  expect(written).toStrictEqual([
    join(ctx.outDir, 'onnx/graph.onnx'),
    join(ctx.outDir, 'tokenizer.json'),
  ]);

  expect(Bun.file(join(ctx.outDir, 'onnx/graph.onnx')).text()).resolves.toBe('a model graph');
  expect(Bun.file(join(ctx.outDir, 'tokenizer.json')).text()).resolves.toBe('{"model":{}}');
});

test('it refuses a file whose SHA-256 differs from the list, and writes nothing for it', async () => {
  const ctx = await setupTest();

  const server = Bun.serve({
    port: 0,
    routes: { '/graph.onnx': new Response('a model graph someone swapped') },
  });

  onTestFinished(() => server.stop(true));

  const pinned = createHash('sha256').update('a model graph').digest('hex');
  const served = createHash('sha256').update('a model graph someone swapped').digest('hex');
  const written = writePinnedFiles(`graph.onnx ${server.url.href}graph.onnx ${pinned}`, ctx.outDir);

  expect(written).rejects.toThrowWithMessage(
    Error,
    `graph.onnx has SHA-256 ${served}, not the ${pinned} the repo records`,
  );

  expect(written).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
  expect(readdir(ctx.outDir)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it keeps a file already in place with the listed SHA-256 and downloads nothing', async () => {
  const ctx = await setupTest();

  const requested: string[] = [];

  const answerRequest = (request: Request) => {
    requested.push(new URL(request.url).pathname);

    return new Response('a model graph');
  };

  const server = Bun.serve({
    port: 0,
    fetch: answerRequest,
  });

  onTestFinished(() => server.stop(true));

  await mkdir(ctx.outDir, { recursive: true });
  await writeFile(join(ctx.outDir, 'graph.onnx'), 'a model graph');

  const sha256 = createHash('sha256').update('a model graph').digest('hex');

  await writePinnedFiles(`graph.onnx ${server.url.href}graph.onnx ${sha256}`, ctx.outDir);

  expect(requested).toStrictEqual([]);
});

test('it downloads again a file in place whose SHA-256 differs from the list', async () => {
  const ctx = await setupTest();

  const server = Bun.serve({ port: 0, routes: { '/graph.onnx': new Response('a model graph') } });

  onTestFinished(() => server.stop(true));

  await mkdir(ctx.outDir, { recursive: true });
  await writeFile(join(ctx.outDir, 'graph.onnx'), 'half a model');

  const sha256 = createHash('sha256').update('a model graph').digest('hex');

  await writePinnedFiles(`graph.onnx ${server.url.href}graph.onnx ${sha256}`, ctx.outDir);

  expect(Bun.file(join(ctx.outDir, 'graph.onnx')).text()).resolves.toBe('a model graph');
});

test('it refuses a URL that answers an error status', async () => {
  const ctx = await setupTest();

  const refuseRequest = mock(() => new Response('gone', { status: 404 }));
  const server = Bun.serve({ port: 0, fetch: refuseRequest });

  onTestFinished(() => server.stop(true));

  const sha256 = createHash('sha256').update('a model graph').digest('hex');

  expect(
    writePinnedFiles(`graph.onnx ${server.url.href}graph.onnx ${sha256}`, ctx.outDir),
  ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
});

test.each([
  ['a line with no SHA-256', 'graph.onnx https://example.test/graph.onnx'],
  ['a SHA-256 that is not 64 hex digits', 'graph.onnx https://example.test/graph.onnx 4a2f'],
  [
    'a path that leaves the folder',
    `../graph.onnx https://example.test/graph.onnx ${'0'.repeat(64)}`,
  ],
  ['an absolute path', `/etc/graph.onnx https://example.test/graph.onnx ${'0'.repeat(64)}`],
  ['a fourth field', `graph.onnx https://example.test/graph.onnx ${'0'.repeat(64)} extra`],
])('it refuses a list with %s', async (_, line) => {
  const ctx = await setupTest();

  expect(writePinnedFiles(line, ctx.outDir)).rejects.toMatchObject({ code: 'PINNED_FILE_LIST' });
});
