import { expect, test } from 'bun:test';
import { join } from 'node:path';
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

test('it keeps each source file directory in the test bundle, so the test sandbox finds its guests', async () => {
  const [release, testBuild] = await Promise.all([readTestBundle(false), readTestBundle(true)]);

  const sessionsDir = JSON.stringify(
    join(import.meta.dir, '..', '..', '..', 'modules', 'sessions', 'src'),
  );

  expect(testBuild.mainText).toInclude(sessionsDir);
  expect(release.mainText).not.toInclude(sessionsDir);
});
