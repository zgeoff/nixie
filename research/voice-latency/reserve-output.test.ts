import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reserveOutput } from './reserve-output.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'reserve-output-'));

  onTestFinished(() => rm(dir, { force: true, recursive: true }));

  return { dir };
}

test('it lets exactly one of two reservations of the same path win', async () => {
  const ctx = await setupTest();
  const out = join(ctx.dir, 'turn-end-hvb.jsonl');

  const reservations = [reserveOutput(out, false), reserveOutput(out, false)];

  expect(reservations.filter((reservation) => 'file' in reservation)).toHaveLength(1);
  expect(reservations.filter((reservation) => 'refused' in reservation)).toStrictEqual([{ refused: 'held' }]);
});

test('it refuses a replacing run while another run holds the path', async () => {
  const ctx = await setupTest();
  const out = join(ctx.dir, 'turn-end-hvb.jsonl');
  reserveOutput(out, false);

  expect(reserveOutput(out, true)).toStrictEqual({ refused: 'held' });
});

test('it refuses a file that holds a run and leaves its bytes alone', async () => {
  const ctx = await setupTest();
  const out = join(ctx.dir, 'turn-end-hvb.jsonl');
  await writeFile(out, '{"set":"hvb","index":0}\n');

  const reservation = reserveOutput(out, false);

  expect(reservation).toStrictEqual({ refused: 'exists' });
  expect(await readFile(out, 'utf8')).toBe('{"set":"hvb","index":0}\n');
});

test('it empties a file that holds a run when the run replaces it', async () => {
  const ctx = await setupTest();
  const out = join(ctx.dir, 'turn-end-hvb.jsonl');
  await writeFile(out, '{"set":"hvb","index":0}\n');

  reserveOutput(out, true);

  expect(await readFile(out, 'utf8')).toBe('');
});

test('it frees the path for the next run once the run releases it', async () => {
  const ctx = await setupTest();
  const out = join(ctx.dir, 'turn-end-hvb.jsonl');
  const first = reserveOutput(out, false);
  if (!('file' in first)) {
    throw new Error('the first reservation was refused');
  }
  first.release();

  expect(reserveOutput(out, true)).toStrictEqual({ file: expect.any(Number), release: expect.any(Function) });
});
