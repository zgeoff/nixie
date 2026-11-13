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

  expect(totals).toStrictEqual({ dollars: 1.5, tokens: 300, lost: false });
});

test('it keeps a lost mark through each later add', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'counter.json'), '{"dollars":1.5,"tokens":300}');

  const store = await createCounterStore(join(ctx.directory, 'counter.json'));

  await store.markLost();
  await store.add({ dollars: 0.5, tokens: 20 });

  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  expect(stored).toBe('{"dollars":2,"tokens":320,"lost":true}');
});

test('it reads a count whose file holds the lost mark as lost', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'counter.json'), '{"dollars":1.5,"tokens":300,"lost":true}');

  const store = await createCounterStore(join(ctx.directory, 'counter.json'));
  const totals = await store.read();

  expect(totals).toStrictEqual({ dollars: 1.5, tokens: 300, lost: true });
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

  expect(totals).toStrictEqual({ dollars: 1, tokens: 60, lost: false });
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

test('it settles once every add made so far has written', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(join(ctx.directory, 'counter.json'));

  void store.add({ dollars: 0.25, tokens: 10 });
  void store.add({ dollars: 0.5, tokens: 20 });

  await store.settle();

  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  expect(stored).toBe('{"dollars":0.75,"tokens":30}');
});

test('it settles with no add made', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(join(ctx.directory, 'counter.json'));

  await expect(store.settle()).toResolve();
});

test('it refuses to start when the counter directory does not exist', async () => {
  const ctx = await setupTest();

  expect(createCounterStore(join(ctx.directory, 'missing', 'counter.json'))).rejects.toThrow();
});
