import { expect, test } from 'bun:test';
import { testBuildIDs } from './test-build-ids';
import { readTestBundle } from './test-utils/read-test-bundle';

test('it builds a release bundle with no fault point, no test rule and no test sandbox', async () => {
  const bundle = await readTestBundle(false);

  expect(bundle.testBuildIDs).toStrictEqual([]);
});

test('it builds a test bundle with every test-build ID the server reaches', async () => {
  const bundle = await readTestBundle(true);

  expect(bundle.testBuildIDs).toStrictEqual(testBuildIDs);
});
