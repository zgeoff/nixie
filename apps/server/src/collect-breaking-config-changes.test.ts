import { expect, test } from 'bun:test';
import { buildConfigJSONSchema } from './build-config-json-schema';
import { collectBreakingConfigChanges } from './collect-breaking-config-changes';

test('it finds no change between a schema and itself', () => {
  expect(
    collectBreakingConfigChanges(buildConfigJSONSchema(), buildConfigJSONSchema()),
  ).toStrictEqual([]);
});

test.each([
  [
    'a new optional key',
    { type: 'object', properties: { port: { type: 'integer' } }, additionalProperties: false },
    {
      type: 'object',
      properties: { port: { type: 'integer' }, log_level: { type: 'string' } },
      additionalProperties: false,
    },
  ],
  [
    'a changed default and description',
    { type: 'integer', default: 8080, description: 'the port' },
    { type: 'integer', default: 9090, description: 'the API port' },
  ],
  ['a lowered minimum', { type: 'integer', minimum: 10 }, { type: 'integer', minimum: 1 }],
  ['a raised maximum', { type: 'integer', maximum: 10 }, { type: 'integer', maximum: 20 }],
  ['a dropped pattern', { type: 'string', pattern: '^a' }, { type: 'string' }],
  ['a new enum value', { enum: ['info', 'warn'] }, { enum: ['info', 'warn', 'debug'] }],
  ['an integer that becomes a number', { type: 'integer' }, { type: 'number' }],
  ['a type that also allows null', { type: 'string' }, { type: ['string', 'null'] }],
  [
    'a key that is no longer required',
    { type: 'object', required: ['url', 'path'] },
    { type: 'object', required: ['url'] },
  ],
  [
    'a dropped key where any key passes',
    { type: 'object', properties: { url: { type: 'string' } } },
    { type: 'object', properties: {} },
  ],
  [
    'an object that accepts any key',
    { additionalProperties: false },
    { additionalProperties: true },
  ],
  [
    'a new anyOf choice',
    { anyOf: [{ type: 'string' }] },
    { anyOf: [{ type: 'string' }, { type: 'null' }] },
  ],
])('it finds no breaking change in %s', (_label, released, current) => {
  expect(collectBreakingConfigChanges(released, current)).toStrictEqual([]);
});

test.each([
  {
    label: 'a dropped key in a strict object',
    released: {
      type: 'object',
      properties: {
        server: { type: 'object', properties: { port: {} }, additionalProperties: false },
      },
    },
    current: {
      type: 'object',
      properties: { server: { type: 'object', properties: {}, additionalProperties: false } },
    },
    expected: ['server.port: is no longer accepted'],
  },
  {
    label: 'a new required key',
    released: { type: 'object', properties: { imp: { type: 'object', required: ['url'] } } },
    current: {
      type: 'object',
      properties: { imp: { type: 'object', required: ['url', 'token'] } },
    },
    expected: ['imp.token: becomes required'],
  },
  {
    label: 'a first required key',
    released: { type: 'object' },
    current: { type: 'object', required: ['url'] },
    expected: ['url: becomes required'],
  },
  {
    label: 'a changed type',
    released: { type: 'object', properties: { port: { type: 'integer' } } },
    current: { type: 'object', properties: { port: { type: 'string' } } },
    expected: ['port: changes type to "string"'],
  },
  {
    label: 'a dropped enum value',
    released: { properties: { log_level: { enum: ['debug', 'info'] } } },
    current: { properties: { log_level: { enum: ['info'] } } },
    expected: ['log_level: drops the value "debug"'],
  },
  {
    label: 'a raised minimum',
    released: { minimum: 1 },
    current: { minimum: 2 },
    expected: ['(root): raises minimum to 2'],
  },
  {
    label: 'a lowered maxLength',
    released: { maxLength: 20 },
    current: { maxLength: 10 },
    expected: ['(root): lowers maxLength to 10'],
  },
  {
    label: 'a new pattern',
    released: { type: 'string' },
    current: { type: 'string', pattern: '^a' },
    expected: ['(root): adds pattern'],
  },
  {
    label: 'a changed format',
    released: { format: 'uri' },
    current: { format: 'email' },
    expected: ['(root): changes format'],
  },
  {
    label: 'a changed const',
    released: { const: 'path' },
    current: { const: 'git' },
    expected: ['(root): changes const'],
  },
  {
    label: 'a narrower record value',
    released: { additionalProperties: { type: ['string', 'null'] } },
    current: { additionalProperties: { type: 'string' } },
    expected: ['*: changes type to "string"'],
  },
  {
    label: 'an object that refuses extra keys',
    released: { additionalProperties: true },
    current: { additionalProperties: false },
    expected: ['*: narrows additionalProperties'],
  },
  {
    label: 'a narrower array item',
    released: { items: { type: 'string' } },
    current: { items: { type: 'string', minLength: 1 } },
    expected: ['[]: adds minLength'],
  },
  {
    label: 'a narrower key name',
    released: { propertyNames: { pattern: '^[a-z]+$' } },
    current: { propertyNames: { pattern: '^[a-z]$' } },
    expected: ['(key): changes pattern'],
  },
  {
    label: 'a dropped anyOf choice',
    released: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    current: { anyOf: [{ type: 'string' }] },
    expected: ['(root): drops anyOf choice 2'],
  },
  {
    label: 'a narrower anyOf choice',
    released: { anyOf: [{ type: 'string' }] },
    current: { anyOf: [{ type: 'string', minLength: 1 }] },
    expected: ['(root): adds minLength'],
  },
  {
    label: 'a new oneOf choice',
    released: { oneOf: [{ type: 'string' }] },
    current: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    expected: ['(root): changes the oneOf choices'],
  },
])('it reports $label', (row) => {
  expect(collectBreakingConfigChanges(row.released, row.current)).toStrictEqual(row.expected);
});
