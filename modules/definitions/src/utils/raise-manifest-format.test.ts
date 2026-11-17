import { expect, test } from 'bun:test';
import { raiseManifestFormat } from './raise-manifest-format';

test('it sets a plain format line and keeps every other line', () => {
  expect(raiseManifestFormat('format: 3\nname: home\n', 4)).toStrictEqual({
    text: 'format: 4\nname: home\n',
    previousFormat: 3,
  });
});

test('it keeps the trailing comment of the format line', () => {
  expect(raiseManifestFormat('format: 3 # kept\n', 4).text).toBe('format: 4 # kept\n');
});

test('it keeps CRLF line endings', () => {
  expect(raiseManifestFormat('# top\r\nformat: 3\r\nname: home\r\n', 4).text).toBe(
    '# top\r\nformat: 4\r\nname: home\r\n',
  );
});

test('it returns the text unchanged when the format is already at the target', () => {
  expect(raiseManifestFormat('format: 4 # kept\n', 4)).toStrictEqual({
    text: 'format: 4 # kept\n',
    previousFormat: 4,
  });
});

test('it refuses a manifest with no format line, and names the fix', () => {
  expect(() => raiseManifestFormat('name: home\n', 4)).toThrow(
    'nixie.yaml has no format line the export can read, so set `format: 4` in it by hand',
  );
});

test('it refuses a format written in flow style', () => {
  expect(() => raiseManifestFormat('{format: 3}\n', 4)).toThrow(
    'nixie.yaml has no format line the export can read, so set `format: 4` in it by hand',
  );
});

test('it refuses a manifest where the edit does not leave the format at the target', () => {
  expect(() => raiseManifestFormat('name: home\nformat: 3\nformat: 3\n', 4)).toThrow(
    'nixie.yaml has a layout the export cannot edit, so set `format: 4` in it by hand',
  );
});
