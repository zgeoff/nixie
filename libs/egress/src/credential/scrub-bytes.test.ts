import { expect, test } from 'bun:test';
import { scrubBytes } from './scrub-bytes';

test('it replaces each occurrence of a form with the marker', () => {
  const scrubbed = scrubBytes(Buffer.from('a fake-value b fake-value'), ['fake-value']);

  expect(Buffer.from(scrubbed).toString()).toBe('a [secret removed] b [secret removed]');
});

test('it cuts the longer form whole when one form holds another', () => {
  const scrubbed = scrubBytes(Buffer.from('x fake-value-long y'), [
    'fake-value',
    'fake-value-long',
  ]);

  expect(Buffer.from(scrubbed).toString()).toBe('x [secret removed] y');
});

test('it returns the bytes it was given when no form occurs', () => {
  const bytes = Buffer.from('nothing here');

  expect(scrubBytes(bytes, ['fake-value'])).toBe(bytes);
});

test('it cuts a form inside binary bytes', () => {
  const bytes = Buffer.concat([
    Buffer.from([0, 255, 1]),
    Buffer.from('fake-value'),
    Buffer.from([2]),
  ]);

  expect(Buffer.from(scrubBytes(bytes, ['fake-value']))).toStrictEqual(
    Buffer.concat([Buffer.from([0, 255, 1]), Buffer.from('[secret removed]'), Buffer.from([2])]),
  );
});

test('it ignores an empty form', () => {
  const bytes = Buffer.from('nothing here');

  expect(scrubBytes(bytes, [''])).toBe(bytes);
});
