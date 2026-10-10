import { expect, test } from 'bun:test';
import { parseDefinitions } from './parse-definitions';

test('it reads the format version and the persona, and lists every other file unapplied', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 1\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['rules/mail.yaml', new TextEncoder().encode('id: mail\noutcome: deny\n')],
    ['jobs/morning.json', new TextEncoder().encode('{"id":"morning"}')],
    ['notes.md', new TextEncoder().encode('# Notes\n')],
  ]);

  expect(parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] })).toStrictEqual({
    formatVersion: 1,
    persona: '# Persona\n',
    unapplied: ['jobs/morning.json', 'notes.md', 'rules/mail.yaml'],
  });
});

test('it refuses definitions without a manifest', () => {
  const files = new Map([['persona.md', new TextEncoder().encode('# Persona\n')]]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(Error, 'nixie.yaml: the definitions have no manifest');
});

test.each([
  ['format 2, which a newer release writes', 'format: 2\n'],
  ['format 0', 'format: 0\n'],
])('it refuses a manifest with %s', (_label, manifest) => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(
    Error,
    /^nixie\.yaml: format \d is not one this release reads, which is 1$/u,
  );
});

test.each([
  ['no format', 'name: mine\n'],
  ['a text format', 'format: one\n'],
  ['a fractional format', 'format: 1.5\n'],
])('it refuses a manifest with %s', (_label, manifest) => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(Error, 'nixie.yaml: format must be a whole number');
});

test('it refuses definitions without a persona', () => {
  const files = new Map([['nixie.yaml', new TextEncoder().encode('format: 1\n')]]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(Error, 'persona.md: the definitions have no persona');
});

test('it refuses an empty persona', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 1\n')],
    ['persona.md', new TextEncoder().encode(' \n\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(Error, 'persona.md: the persona is empty');
});

test('it refuses a persona that is not UTF-8 text', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 1\n')],
    ['persona.md', Uint8Array.from([0xff, 0xfe, 0x00])],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(Error, 'persona.md: the file is not UTF-8 text');
});

test('it refuses an unapplied YAML file that fails to parse', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 1\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['rules/mail.yaml', new TextEncoder().encode('id: [mail\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(Error, /^rules\/mail\.yaml: YAML Parse error/u);
});

test('it refuses an unapplied JSON file that fails to parse', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 1\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['jobs/morning.json', new TextEncoder().encode('{"id":')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', skipped: [] }),
  ).toThrowWithMessage(Error, /^jobs\/morning\.json: JSON Parse error/u);
});
