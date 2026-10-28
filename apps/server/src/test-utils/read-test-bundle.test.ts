import { expect, test } from 'bun:test';
import { readTestBundle } from './read-test-bundle';

test('it reads the server and its SQLite worker from the release bundle of the run', async () => {
  const bundle = await readTestBundle(false);

  expect(bundle.files).toStrictEqual(['main.js', 'sqlite-worker.js']);
  expect(bundle.mainText).toInclude('sqlite-worker');
});
