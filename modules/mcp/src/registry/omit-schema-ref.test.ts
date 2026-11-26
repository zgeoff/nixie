import { expect, test } from 'bun:test';
import { omitSchemaRef } from './omit-schema-ref';

test('it keeps each keyword beside the ref and drops the ref', () => {
  const schema = { $ref: '#/$defs/owner', properties: { note: { type: 'string' } } };

  expect(omitSchemaRef(schema)).toStrictEqual({ properties: { note: { type: 'string' } } });
});
