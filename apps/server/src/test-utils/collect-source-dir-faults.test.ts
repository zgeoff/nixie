import { expect, test } from 'bun:test';
import { collectSourceDirFaults } from './collect-source-dir-faults';

test('it finds no fault when only the test bundle holds the source folder', () => {
  expect(
    collectSourceDirFaults(
      {
        test: 'const dir = "/srv/tide/modules/sessions/src";',
        release: 'const dir = import.meta.dir;',
      },
      '/srv/tide/modules/sessions/src',
    ),
  ).toStrictEqual([]);
});

test('it reports a test bundle that does not hold the source folder', () => {
  expect(
    collectSourceDirFaults(
      { test: 'const dir = import.meta.dir;', release: 'const dir = import.meta.dir;' },
      '/srv/tide/modules/sessions/src',
    ),
  ).toStrictEqual([
    'the test bundle does not read /srv/tide/modules/sessions/src as its source folder',
  ]);
});

test('it reports a release bundle that holds the source folder', () => {
  expect(
    collectSourceDirFaults(
      {
        test: 'const dir = "/srv/tide/modules/sessions/src";',
        release: 'const dir = "/srv/tide/modules/sessions/src";',
      },
      '/srv/tide/modules/sessions/src',
    ),
  ).toStrictEqual([
    'the release bundle reads /srv/tide/modules/sessions/src, a folder of the host that built it',
  ]);
});
