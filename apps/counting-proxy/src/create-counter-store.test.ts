import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCounterStore } from './create-counter-store';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'counter-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it starts a missing counter file at zero', async () => {
  const ctx = await setupTest();

  await createCounterStore(join(ctx.directory, 'counter.json'));

  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  expect(stored).toBe('{"dollars":0,"tokens":0}');
});

test('it keeps the count an existing counter file holds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'counter.json'), '{"dollars":1.5,"tokens":300}');

  const store = await createCounterStore(join(ctx.directory, 'counter.json'));
  const totals = await store.read();

  expect(totals).toStrictEqual({ dollars: 1.5, tokens: 300 });
});

test('it adds every spend once when several adds run together', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(join(ctx.directory, 'counter.json'));

  await Promise.all([
    store.add({ dollars: 0.25, tokens: 10 }),
    store.add({ dollars: 0.25, tokens: 20 }),
    store.add({ dollars: 0.5, tokens: 30 }),
  ]);

  const totals = await store.read();

  expect(totals).toStrictEqual({ dollars: 1, tokens: 60 });
});

test('it returns the new totals from an add', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(join(ctx.directory, 'counter.json'));
  const totals = await store.add({ dollars: 0.5, tokens: 40 });

  expect(totals).toStrictEqual({ dollars: 0.5, tokens: 40 });
});

test('it fails a read when the counter file is gone', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(join(ctx.directory, 'counter.json'));

  await rm(join(ctx.directory, 'counter.json'));

  expect(store.read()).rejects.toThrow();
});

test('it fails an add when the counter directory is gone, and the next add still runs', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(join(ctx.directory, 'counter.json'));

  await rm(ctx.directory, { recursive: true });

  const failed = await store.add({ dollars: 1, tokens: 1 }).then(
    () => null,
    (error: unknown) => error,
  );

  const next = await store.add({ dollars: 1, tokens: 1 }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failed).toBeInstanceOf(Error);
  expect(next).toBeInstanceOf(Error);
});

test('it refuses to start when the counter directory does not exist', async () => {
  const ctx = await setupTest();

  expect(createCounterStore(join(ctx.directory, 'missing', 'counter.json'))).rejects.toThrow();
});
