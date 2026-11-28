import { expect, test } from 'bun:test';
import { buildListedInput } from './build-listed-input';

function setupTest() {
  return {
    input: {
      type: 'object',
      properties: { query: { type: 'string' }, connection: { type: 'string' } },
      required: ['query'],
    },
    work: { connection: 'k3x9m2p7qa', label: 'Work', account: 'sam@example.com' },
    personal: { connection: 'p8d2v6n4rc', label: 'Personal', account: 'sam.lee@example.org' },
  };
}

test('it lists one allowed value for each of two reachable connections and requires it', () => {
  const ctx = setupTest();

  expect(buildListedInput(ctx.input, [ctx.work, ctx.personal])).toStrictEqual({
    type: 'object',
    properties: {
      query: { type: 'string' },
      connection: {
        oneOf: [
          { const: 'k3x9m2p7qa', description: 'Work: sam@example.com' },
          { const: 'p8d2v6n4rc', description: 'Personal: sam.lee@example.org' },
        ],
      },
    },
    required: ['query', 'connection'],
  });
});

test('it leaves the connection argument out for one reachable connection', () => {
  const ctx = setupTest();

  expect(buildListedInput(ctx.input, [ctx.work])).toStrictEqual({
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  });
});

test('it leaves a tool without a connection argument as it is', () => {
  const input = { type: 'object', properties: { query: { type: 'string' } } };

  expect(buildListedInput(input, [])).toStrictEqual(input);
});
