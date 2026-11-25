import { expect, test } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { buildPackageTarball } from '../test-utils/build-package-tarball';
import { parsePackageTarball } from './parse-package-tarball';

test('it returns each file with the package folder removed', () => {
  const tarball = buildPackageTarball([
    { path: 'package/package.json', content: '{}' },
    { path: 'package/dist/chart.umd.js', content: 'var a = 1;' },
  ]);

  const parsed = parsePackageTarball(tarball, 1000);

  expect(parsed).toStrictEqual({
    kind: 'files',
    files: [
      { path: 'package.json', bytes: new TextEncoder().encode('{}') },
      { path: 'dist/chart.umd.js', bytes: new TextEncoder().encode('var a = 1;') },
    ],
  });
});

test.each([
  ['a symlink', { path: 'package/link', type: '2' }],
  ['a hard link', { path: 'package/link', type: '1' }],
  ['a path with a .. segment', { path: 'package/../outside.js', content: 'x' }],
  ['an absolute path', { path: '/etc/outside.js', content: 'x' }],
  ['a path outside the package folder', { path: 'other/file.js', content: 'x' }],
  ['a backslash', { path: String.raw`package/a\b.js`, content: 'x' }],
])('it refuses a tarball that holds %s', (_name, entry) => {
  const tarball = buildPackageTarball([{ path: 'package/ok.js', content: 'ok' }, entry]);

  expect(parsePackageTarball(tarball, 1000).kind).toBe('refused');
});

test('it refuses a package whose files pass the byte limit', () => {
  const tarball = buildPackageTarball([{ path: 'package/big.js', content: 'x'.repeat(101) }]);

  expect(parsePackageTarball(tarball, 100)).toStrictEqual({
    kind: 'refused',
    reason: 'the package unpacks past 100 bytes',
  });
});

test('it refuses a gzip that unpacks far past the limit, before it holds the whole output', () => {
  const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024));

  expect(parsePackageTarball(bomb, 1000)).toStrictEqual({
    kind: 'refused',
    reason: 'the tarball is not gzip, or it unpacks past the size limit',
  });
});

test('it refuses a tarball that holds one path twice', () => {
  const tarball = buildPackageTarball([
    { path: 'package/a.js', content: '1' },
    { path: 'package/a.js', content: '2' },
  ]);

  expect(parsePackageTarball(tarball, 1000).kind).toBe('refused');
});

test('it refuses bytes that are not gzip', () => {
  expect(parsePackageTarball(new TextEncoder().encode('plain'), 1000).kind).toBe('refused');
});
