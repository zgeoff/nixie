import { expect, test } from 'bun:test';
import { checkReportShape } from './check-report-shape';

test('it accepts a shape and adds the object type and closed properties, with sorted keys', () => {
  const check = checkReportShape({
    required: ['city'],
    properties: { city: { type: 'string', maxLength: 40 }, count: { type: 'integer' } },
  });

  expect(check).toStrictEqual({
    status: 'accepted',
    shape: {
      type: 'object',
      additionalProperties: false,
      properties: {
        city: { type: 'string', maxLength: 40 },
        count: { type: 'integer' },
      },
      required: ['city'],
    },
  });
});

test('it gives two shapes that differ only in key order one JSON text', () => {
  const first = checkReportShape({
    properties: { beta: { type: 'string' }, alpha: { type: 'number' } },
  });

  const second = checkReportShape({
    properties: { alpha: { type: 'number' }, beta: { type: 'string' } },
  });

  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
});

test('it accepts a nested object and an array of objects, closing each', () => {
  const check = checkReportShape({
    properties: {
      stops: {
        type: 'array',
        maxItems: 5,
        items: { type: 'object', properties: { name: { type: 'string' } } },
      },
    },
  });

  expect(check.status).toBe('accepted');
});

test.each([
  [
    'a keyword outside the closed table',
    { properties: { code: { type: 'string', pattern: 'a' } } },
  ],
  ['a stray key at the top level', { properties: { alpha: { type: 'string' } }, title: 'x' }],
  ['a shape that is no object', 'a string'],
  ['a shape with no fields', { properties: {} }],
  ['a field with an unknown type', { properties: { alpha: { type: 'date' } } }],
  ['a field name that is not an identifier', { properties: { 'alpha beta': { type: 'string' } } }],
  [
    'a required name that the properties lack',
    { properties: { alpha: { type: 'string' } }, required: ['beta'] },
  ],
  [
    'a keyword on a type it does not apply to',
    { properties: { alpha: { type: 'string', minimum: 1 } } },
  ],
])('it refuses %s', (_name, shape) => {
  expect(checkReportShape(shape).status).toBe('refused');
});

test('it names the keyword and the path of a field that uses a keyword it cannot enforce', () => {
  expect(
    checkReportShape({ properties: { code: { type: 'string', pattern: 'a' } } }),
  ).toStrictEqual({
    status: 'refused',
    fault: { fault: 'keyword', path: 'code', keyword: 'pattern' },
  });
});

test('it refuses a shape longer than the most characters', () => {
  const properties = Object.fromEntries(
    Array.from({ length: 60 }, (_unused, index) => [
      `field${String(index)}`,
      { type: 'string', description: 'x'.repeat(150) },
    ]),
  );

  expect(checkReportShape({ properties })).toStrictEqual({
    status: 'refused',
    fault: { fault: 'size', size: expect.toBeNumber(), max: 4000 },
  });
});
