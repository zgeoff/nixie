import { expect, test } from 'bun:test';
import { nixieSchema } from '@heynixie/db';
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

test.each([
  { kind: 'release', isTestBuild: false },
  { kind: 'test', isTestBuild: true },
])(
  'it bundles every migration of the schema in number order into the $kind bundle',
  async (row) => {
    const bundle = await readTestBundle(row.isTestBuild);

    const positions = nixieSchema.migrations.map((migration) =>
      bundle.mainText.indexOf(JSON.stringify(migration.name).slice(1, -1)),
    );

    expect(positions).toSatisfyAll((position: number) => position >= 0);
    expect(positions).toStrictEqual(positions.toSorted((left, right) => left - right));
  },
);

test('it leaves the runtime migration loader out of the release bundle', async () => {
  const bundle = await readTestBundle(false);

  expect(bundle.mainText).not.toContain('readMigrations');
});
