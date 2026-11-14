import { expect, test } from 'bun:test';
import { normalizeLineEndings } from './normalize-line-endings';

test('it turns every CRLF line ending into LF', () => {
  const crlf = new TextEncoder().encode('# Persona\r\n\r\nWarm.\r\n');

  expect(new TextDecoder().decode(normalizeLineEndings(crlf))).toBe('# Persona\n\nWarm.\n');
});

test('it keeps a carriage return that no line feed follows', () => {
  const lone = new TextEncoder().encode('a\rb\n');

  expect(normalizeLineEndings(lone)).toStrictEqual(lone);
});

test('it returns LF bytes unchanged', () => {
  const lf = new TextEncoder().encode('# Persona\n');

  expect(normalizeLineEndings(lf)).toBe(lf);
});
