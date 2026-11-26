import { expect, test } from 'bun:test';
import { collectNameFaults } from './collect-name-faults';

test.each([
  { title: 'its package', where: 'modules/api' },
  { title: 'its file', where: 'modules/api/src/a.ts' },
])('it finds no fault for a name that an exception on $title covers', (row) => {
  const faults = collectNameFaults(
    [{ file: 'modules/api/src/a.ts', name: 'google' }],
    [{ where: row.where, names: ['google'], removedBy: 'GEO-2879' }],
  );

  expect(faults).toStrictEqual([]);
});

test('it names the file, the name and the fix for a name that no exception covers', () => {
  const faults = collectNameFaults([{ file: 'modules/api/src/a.ts', name: 'google' }], []);

  expect(faults).toStrictEqual([
    expect.stringMatching(
      /^modules\/api\/src\/a\.ts names google.*Move the code into the feature's package, or fill a core list from the composition root\./u,
    ),
  ]);
});

test.each([
  { title: 'another package', where: 'modules/apis', names: ['google'] },
  { title: 'another name', where: 'modules/api', names: ['mcp'] },
])('it finds a fault when an exception covers $title', (row) => {
  const faults = collectNameFaults(
    [{ file: 'modules/api/src/a.ts', name: 'google' }],
    [{ where: row.where, names: row.names, removedBy: 'GEO-2879' }],
  );

  expect(faults).toHaveLength(1);
});
