import { expect, test } from 'bun:test';
import { buildStubLibraryOpener } from './build-stub-library-opener';

test('it returns the library listed under the name', () => {
  const openLibrary = buildStubLibraryOpener({ 'libz.so.1': 'zlib handle' });

  expect(openLibrary('libz.so.1')).toBe('zlib handle');
});

test('it throws for a name with no library listed', () => {
  const openLibrary = buildStubLibraryOpener({ 'libz.so.1': 'zlib handle' });

  expect(() => openLibrary('libpng.so.16')).toThrow('cannot open libpng.so.16');
});
