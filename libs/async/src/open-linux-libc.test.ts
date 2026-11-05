import { expect, test } from 'bun:test';
import { openLinuxLibc } from './open-linux-libc';
import { buildStubLibraryOpener } from './test-utils/build-stub-library-opener';

test('it opens glibc when it loads, even with musl present', () => {
  const openLibrary = buildStubLibraryOpener({
    'libc.so.6': 'glibc handle',
    'libc.musl-x86_64.so.1': 'musl handle',
  });

  expect(openLinuxLibc(openLibrary, 'x64')).toBe('glibc handle');
  expect(openLibrary.mock.calls).toStrictEqual([['libc.so.6']]);
});

test.each([
  ['x64', 'libc.musl-x86_64.so.1'],
  ['arm64', 'libc.musl-aarch64.so.1'],
] as const)('it opens musl on %s when glibc fails to load', (architecture, muslName) => {
  const openLibrary = buildStubLibraryOpener({ [muslName]: 'musl handle' });

  expect(openLinuxLibc(openLibrary, architecture)).toBe('musl handle');
});

test('it throws when neither glibc nor musl loads', () => {
  const openLibrary = buildStubLibraryOpener({});

  expect(() => openLinuxLibc(openLibrary, 'x64')).toThrow();
});

test('it throws without trying musl on an architecture musl has no name for', () => {
  const openLibrary = buildStubLibraryOpener({});

  expect(() => openLinuxLibc(openLibrary, 'riscv64')).toThrow();
  expect(openLibrary.mock.calls).toStrictEqual([['libc.so.6']]);
});
