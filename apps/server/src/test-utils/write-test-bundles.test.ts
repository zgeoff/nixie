import { expect, test } from 'bun:test';
import { readTestBundle } from './read-test-bundle';
import { writeTestBundles } from './write-test-bundles';

test('it leaves the release bundle and the test bundle of the current sources to read', async () => {
  await writeTestBundles();

  const [release, testBuild] = await Promise.all([readTestBundle(false), readTestBundle(true)]);

  expect(release.testBuildIDs).toStrictEqual([]);
  expect(testBuild.testBuildIDs).not.toStrictEqual([]);
});
