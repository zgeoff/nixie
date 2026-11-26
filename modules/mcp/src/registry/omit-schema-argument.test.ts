import { expect, test } from 'bun:test';
import { omitSchemaArgument } from './omit-schema-argument';

test('it drops the property and the required entry of the argument', () => {
  const schema = {
    type: 'object',
    properties: { title: { type: 'string' }, request_id: { type: 'string' } },
    required: ['title', 'request_id'],
  };

  expect(omitSchemaArgument(schema, 'request_id')).toStrictEqual({
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  });
});

test('it drops the argument from each member of a union', () => {
  const schema = {
    type: 'object',
    anyOf: [
      { properties: { request_id: { type: 'string' } }, required: ['request_id'] },
      { properties: { title: { type: 'string' } } },
    ],
  };

  expect(omitSchemaArgument(schema, 'request_id')).toStrictEqual({
    type: 'object',
    anyOf: [{ properties: {}, required: [] }, { properties: { title: { type: 'string' } } }],
  });
});

test('it keeps a nested property of the same name', () => {
  const schema = {
    type: 'object',
    properties: { filter: { type: 'object', properties: { request_id: { type: 'string' } } } },
  };

  expect(omitSchemaArgument(schema, 'request_id')).toStrictEqual(schema);
});
