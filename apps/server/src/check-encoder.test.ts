import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkEncoder } from './check-encoder';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip. The model files come from `bun run
// models`, which `bun run test` runs first, so a plain `bun test` without them skips this test and
// CI, which always has them, never does.
const isModelMissing =
  !(await Bun.file(
    join(import.meta.dir, '../../../node_modules/.cache/nixie-encoder/tokenizer.json'),
  ).exists()) && process.env['CI'] === undefined;

function setupTest() {
  return { io: { log: mock(), print: mock(), waitForSignal: mock() } };
}

test.skipIf(isModelMissing)(
  'it loads the encoder, encodes a query and prints its width',
  async () => {
    const ctx = setupTest();
    const encoderDir = join(import.meta.dir, '../../../node_modules/.cache/nixie-encoder');

    const exitCode = await checkEncoder(encoderDir, ctx.io);

    expect(exitCode).toBe(0);

    expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
      `the encoder in ${encoderDir} loaded and encoded a query as 768 numbers`,
    );
  },
);

test('it throws for a folder that holds no model', async () => {
  const ctx = setupTest();

  const dir = await mkdtemp(join(tmpdir(), 'nixie-encoder-check-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  expect(checkEncoder(dir, ctx.io)).rejects.toThrow();
});
