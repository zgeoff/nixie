import { expect, test } from 'bun:test';
import { buildSchemaParser } from './build-schema-parser';

test('it accepts a value that matches the schema', () => {
  const parse = buildSchemaParser({
    type: 'object',
    properties: { pagesRead: { type: 'array', items: { type: 'string' } } },
    required: ['pagesRead'],
    additionalProperties: false,
  });

  expect(parse({ pagesRead: ['north'] })).toStrictEqual({ isValid: true });
});

test('it names a declared field and its rule when the value misses the schema', () => {
  const parse = buildSchemaParser({
    type: 'object',
    properties: { confidence: { type: 'string', enum: ['low', 'high'] } },
    required: ['confidence'],
    additionalProperties: false,
  });

  expect(parse({ confidence: 'middling' })).toStrictEqual({
    isValid: false,
    errors: 'data/confidence must be equal to one of the allowed values',
  });
});

test('it repeats neither a value nor a key that the call sent', () => {
  const marker = 'MARKER-7f3a';

  const parse = buildSchemaParser({
    type: 'object',
    properties: {
      pagesRead: { type: 'array', items: { type: 'string' } },
      tags: { type: 'object', additionalProperties: { type: 'number' } },
    },
    required: ['pagesRead', 'missing'],
    additionalProperties: false,
  });

  const check = parse({
    pagesRead: [marker],
    [marker]: marker,
    tags: { [marker]: marker },
  });

  expect(check.isValid).toBeFalse();
  expect(JSON.stringify(check)).not.toContain(marker);
});

test('it repeats no part of a key that the call sent, whatever characters the key holds', () => {
  const marker = 'MARKER-7f3a';

  const parse = buildSchemaParser({
    type: 'object',
    properties: { fields: { type: 'object', additionalProperties: { type: 'number' } } },
  });

  const check = parse({
    fields: { [`prefix ${marker}`]: 'bad', [`a, data/${marker} must`]: 'bad' },
  });

  expect(check.isValid).toBeFalse();
  expect(JSON.stringify(check)).not.toContain(marker);
  expect(JSON.stringify(check)).not.toContain('prefix');
});

test.each([
  {
    name: 'a string over maxLength',
    schema: { type: 'string', maxLength: 2000 },
    value: 'x'.repeat(2347),
    errors: 'data/text is 2,347 characters, 347 over the 2,000 limit',
  },
  {
    name: 'an array over maxItems',
    schema: { type: 'array', maxItems: 3 },
    value: [1, 2, 3, 4, 5],
    errors: 'data/text is 5 items, 2 over the 3 limit',
  },
])('it says how far over the limit $name runs', (row) => {
  const parse = buildSchemaParser({
    type: 'object',
    properties: { text: row.schema },
    required: ['text'],
  });

  expect(parse({ text: row.value })).toStrictEqual({ isValid: false, errors: row.errors });
});

test('it counts a character outside the basic plane once', () => {
  const parse = buildSchemaParser({
    type: 'object',
    properties: { text: { type: 'string', maxLength: 2 } },
  });

  expect(parse({ text: '😀😀😀' })).toStrictEqual({
    isValid: false,
    errors: 'data/text is 3 characters, 1 over the 2 limit',
  });
});
