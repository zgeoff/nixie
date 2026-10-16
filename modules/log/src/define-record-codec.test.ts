import { expect, test } from 'bun:test';
import { z } from 'zod';
import { defineRecordCodec } from './define-record-codec';

test('it decodes the payload it encoded', () => {
  const words = z.exactOptional(z.number());
  const codec = defineRecordCodec('note_written', z.object({ noteID: z.string(), words }));

  expect(codec.decode(codec.encode({ noteID: 'note-a', words: 3 }))).toStrictEqual({
    noteID: 'note-a',
    words: 3,
  });
});

test('it names the kind its payload belongs to', () => {
  const codec = defineRecordCodec('note_written', z.object({ noteID: z.string() }));

  expect(codec.kind).toBe('note_written');
});

test('it drops a field the schema does not name when it decodes', () => {
  const codec = defineRecordCodec('note_written', z.object({ noteID: z.string() }));

  expect(codec.decode({ noteID: 'note-a', stale: true })).toStrictEqual({ noteID: 'note-a' });
});

test('it rejects a payload that lacks a field', () => {
  const codec = defineRecordCodec('note_written', z.object({ noteID: z.string() }));

  expect(() => codec.decode({ words: 3 })).toThrow(z.ZodError);
});

test('it rejects a payload with a field of the wrong type before a writer appends it', () => {
  const codec = defineRecordCodec('note_written', z.object({ words: z.int() }));

  expect(() => codec.encode({ words: 1.5 })).toThrow(z.ZodError);
});

test('it reads the fields an older payload holds when a reader tries it in part', () => {
  const codec = defineRecordCodec(
    'note_written',
    z.object({ noteID: z.string(), words: z.number() }),
  );

  expect(codec.tryDecodePartial({ words: 3 })).toStrictEqual({ words: 3 });
});

test('it gives null when a field that is present does not fit', () => {
  const codec = defineRecordCodec(
    'note_written',
    z.object({ noteID: z.string(), words: z.number() }),
  );

  expect(codec.tryDecodePartial({ noteID: 'note-a', words: 'three' })).toBeNull();
});
