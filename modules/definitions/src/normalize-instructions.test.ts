import { expect, test } from 'bun:test';
import { normalizeInstructions } from './normalize-instructions';

test('it composes decomposed characters into Unicode NFC', () => {
  expect(normalizeInstructions('Cafe\u0301\n')).toBe('Caf\u00E9\n');
});

test('it turns CRLF and lone CR line endings into LF', () => {
  expect(normalizeInstructions('one\r\ntwo\rthree\n')).toBe('one\ntwo\nthree\n');
});

test('it drops a leading byte order mark', () => {
  expect(normalizeInstructions('\uFEFF# Persona\n')).toBe('# Persona\n');
});

test.each([
  ['no final newline', '# Persona'],
  ['one final newline', '# Persona\n'],
  ['3 final newlines', '# Persona\n\n\n'],
])('it ends text with %s in exactly one newline', (_label, text) => {
  expect(normalizeInstructions(text)).toBe('# Persona\n');
});

test('it keeps trailing spaces, which end a markdown line with a break', () => {
  expect(normalizeInstructions('Warm,  \nbrief.  \n')).toBe('Warm,  \nbrief.  \n');
});
