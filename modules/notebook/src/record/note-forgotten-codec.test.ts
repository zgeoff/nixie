import { expect, test } from 'bun:test';
import { noteForgottenCodec } from './note-forgotten-codec';

test('it reads a record with no by field as a forget by the user', () => {
  const decoded = noteForgottenCodec.decode({ note: 'note-uuid-a', shortID: 'n4w8k2c6rd' });

  expect(decoded).toStrictEqual({ note: 'note-uuid-a', shortID: 'n4w8k2c6rd', by: 'user' });
});

test('it reads a record that names the assistant as a forget by the assistant', () => {
  const decoded = noteForgottenCodec.decode({
    note: 'note-uuid-a',
    shortID: 'n4w8k2c6rd',
    by: 'assistant',
  });

  expect(decoded.by).toBe('assistant');
});
