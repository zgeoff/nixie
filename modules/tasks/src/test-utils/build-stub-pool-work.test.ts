import { expect, onTestFinished, test } from 'bun:test';
import { buildStubPoolWork } from './build-stub-pool-work';

test('it claims the queued work in order, then finds none', async () => {
  const work = buildStubPoolWork(['a', 'b']);

  const claims = [await work.claim(), await work.claim(), await work.claim()];

  expect(claims).toStrictEqual(['a', 'b', null]);
});

test('it holds a run in flight until released', () => {
  const work = buildStubPoolWork([]);

  onTestFinished(work.releaseAll);

  void work.run('a');

  expect([...work.running.keys()]).toStrictEqual(['a']);
});

test('it finishes every run in flight once released', async () => {
  const work = buildStubPoolWork([]);
  const runs = Promise.all([work.run('a'), work.run('b')]);

  work.releaseAll();
  await runs;

  expect(work.finished).toStrictEqual(['a', 'b']);
});

test('it records the most runs in flight at once', async () => {
  const work = buildStubPoolWork([]);
  const first = Promise.all([work.run('a'), work.run('b')]);

  work.releaseAll();
  await first;

  const second = work.run('c');

  work.releaseAll();
  await second;

  expect(work.peak.running).toBe(2);
});
