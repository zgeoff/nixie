import { expect, test } from 'bun:test';
import { buildStubHeldRun } from './build-stub-held-run.ts';

test('it records each item as its run starts', () => {
  const held = buildStubHeldRun((item: string) => `${item} done`);

  void held.run('a');
  void held.run('b');

  expect(held.started).toStrictEqual(['a', 'b']);
});

test('it finishes a run only once its item is released', async () => {
  const held = buildStubHeldRun((item: string) => `${item} done`);
  const first = held.run('a');
  const second = held.run('b');

  held.release('b');

  const secondOutput = await second;
  const firstOutput = await Promise.race([first, 'still held']);

  expect(secondOutput).toBe('b done');
  expect(firstOutput).toBe('still held');
});

test('it finishes a run whose item was released before the run started', async () => {
  const held = buildStubHeldRun((item: string) => `${item} done`);

  held.release('a');

  const output = await held.run('a');

  expect(output).toBe('a done');
});

test('it finishes every run, started or later, once all are released', async () => {
  const held = buildStubHeldRun((item: string) => `${item} done`);

  const first = held.run('a');

  held.releaseAll();

  const outputs = await Promise.all([first, held.run('b')]);

  expect(outputs).toStrictEqual(['a done', 'b done']);
});
