import { expect, test } from 'bun:test';
import { parsePackageMetadata } from './parse-package-metadata';

function setupTest() {
  const integrity = `sha512-${'A'.repeat(86)}==`;

  return {
    integrity,
    buildDocument: (overrides: Record<string, unknown> = {}) =>
      JSON.stringify({
        name: 'chart.js',
        version: '4.4.6',
        description: 'Charts for pages',
        _npmUser: { name: 'a-publisher' },
        dist: { integrity, unpackedSize: 2048 },
        ...overrides,
      }),
  };
}

test('it reads the publisher, the size and the hash of the version asked for', () => {
  const ctx = setupTest();
  const parsed = parsePackageMetadata(ctx.buildDocument(), 'chart.js', '4.4.6');

  expect(parsed).toStrictEqual({
    name: 'chart.js',
    version: '4.4.6',
    integrity: ctx.integrity,
    unpackedBytes: 2048,
    publisher: 'a-publisher',
    description: 'Charts for pages',
  });
});

test('it leaves the size null when the registry leaves it out', () => {
  const ctx = setupTest();
  const document = ctx.buildDocument({ dist: { integrity: ctx.integrity } });
  const parsed = parsePackageMetadata(document, 'chart.js', '4.4.6');

  expect(parsed?.unpackedBytes).toBeNull();
});

test.each([
  ['a document for another version', { version: '4.4.5' }],
  ['a document for another package', { name: 'other' }],
  ['a hash that is not sha512', { dist: { integrity: 'sha1-abc' } }],
  ['a document with no hash', { dist: {} }],
])('it returns null for %s', (_title, overrides) => {
  const ctx = setupTest();

  expect(parsePackageMetadata(ctx.buildDocument(overrides), 'chart.js', '4.4.6')).toBeNull();
});

test('it returns null for text that is no JSON', () => {
  expect(parsePackageMetadata('not json', 'chart.js', '4.4.6')).toBeNull();
});

test('it cuts a long description', () => {
  const ctx = setupTest();
  const document = ctx.buildDocument({ description: 'x'.repeat(5000) });
  const parsed = parsePackageMetadata(document, 'chart.js', '4.4.6');

  expect(parsed?.description).toHaveLength(500);
});
