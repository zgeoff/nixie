import { expect, test } from 'bun:test';
import { findConfigProblem } from './find-config-problem.ts';

test('it finds no problem when the schema accepts the config', () => {
  expect(
    findConfigProblem(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { server: { type: 'object', properties: { port: { type: 'number' } } } },
        additionalProperties: false,
      },
      { server: { port: 8080 } },
    ),
  ).toBeNull();
});

test('it names a section that the schema does not know', () => {
  expect(
    findConfigProblem(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { server: { type: 'object', properties: { port: { type: 'number' } } } },
        additionalProperties: false,
      },
      { server: {}, computer: {} },
    ),
  ).toBe('the config must NOT have additional properties');
});

test('it names the path of a value of the wrong type', () => {
  expect(
    findConfigProblem(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { server: { type: 'object', properties: { port: { type: 'number' } } } },
        additionalProperties: false,
      },
      { server: { port: 'high' } },
    ),
  ).toBe('/server/port must be number');
});
