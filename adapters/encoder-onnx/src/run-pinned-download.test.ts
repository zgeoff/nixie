import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-pinned-run-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { listPath: join(directory, 'model-files.txt'), outDir: join(directory, 'out') };
}

test('it exits 1 and names the file when a download differs from its SHA-256, as the image build runs it', async () => {
  const ctx = await setupTest();

  const server = Bun.serve({
    port: 0,
    routes: { '/model_quantized.onnx_data': new Response('weights someone swapped') },
  });

  onTestFinished(() => server.stop(true));

  const pinned = createHash('sha256').update('the pinned weights').digest('hex');

  await writeFile(
    ctx.listPath,
    `onnx/model_quantized.onnx_data ${server.url.href}model_quantized.onnx_data ${pinned}\n`,
  );

  const run = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'run-pinned-download.ts'), ctx.listPath, ctx.outDir],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const [exitCode, stderr] = await Promise.all([run.exited, new Response(run.stderr).text()]);

  expect(exitCode).toBe(1);

  expect(stderr).toBe(
    `onnx/model_quantized.onnx_data has SHA-256 ${createHash('sha256').update('weights someone swapped').digest('hex')}, not the ${pinned} the repo records\n`,
  );

  expect(readdir(ctx.outDir)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it exits 0 and lists each file it wrote when every SHA-256 matches', async () => {
  const ctx = await setupTest();

  const server = Bun.serve({
    port: 0,
    routes: { '/tokenizer.json': new Response('{"model":{}}') },
  });

  onTestFinished(() => server.stop(true));

  const sha256 = createHash('sha256').update('{"model":{}}').digest('hex');

  await writeFile(ctx.listPath, `tokenizer.json ${server.url.href}tokenizer.json ${sha256}\n`);

  const run = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'run-pinned-download.ts'), ctx.listPath, ctx.outDir],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const [exitCode, stdout] = await Promise.all([run.exited, new Response(run.stdout).text()]);

  expect(exitCode).toBe(0);
  expect(stdout).toBe(`checked and wrote ${join(ctx.outDir, 'tokenizer.json')}\n`);
});

test('it exits 2 with its usage when the arguments are missing', async () => {
  const run = Bun.spawn([process.execPath, join(import.meta.dir, 'run-pinned-download.ts')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stderr] = await Promise.all([run.exited, new Response(run.stderr).text()]);

  expect(exitCode).toBe(2);
  expect(stderr).toBe('usage: run-pinned-download.ts <list> <outdir>\n');
});
