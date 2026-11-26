import { expect, test } from 'bun:test';
import { collectStaleOwnedPaths } from './collect-stale-owned-paths';

test('it finds no fault for an owned path that holds the name of its feature', () => {
  const faults = collectStaleOwnedPaths(
    [{ file: 'modules/api/src/computer/a.ts', name: 'computer' }],
    { computer: ['modules/api/src/computer'] },
    ['modules/api'],
  );

  expect(faults).toStrictEqual([]);
});

test.each([
  { title: 'holds no name', leaks: [] },
  {
    title: 'holds only the name of another feature',
    leaks: [{ file: 'modules/api/src/computer/a.ts', name: 'mcp' }],
  },
])('it finds a fault for an owned path that $title', (row) => {
  const faults = collectStaleOwnedPaths(row.leaks, { computer: ['modules/api/src/computer'] }, [
    'modules/api',
  ]);

  expect(faults).toHaveLength(1);
});

test('it leaves an owned path of another package to the share that reads that package', () => {
  const faults = collectStaleOwnedPaths([], { computer: ['modules/api/src/computer'] }, [
    'modules/log',
  ]);

  expect(faults).toStrictEqual([]);
});
