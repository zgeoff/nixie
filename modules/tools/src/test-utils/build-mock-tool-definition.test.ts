import { expect, test } from 'bun:test';
import { buildMockToolDefinition } from './build-mock-tool-definition';

test('it builds a default tool definition', () => {
  expect(buildMockToolDefinition()).toStrictEqual({
    name: expect.toSatisfy((name: string) => /^[a-z]{12}$/u.test(name)),
    description: expect.toBeString(),
    input: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    execution: 'direct',
    run: expect.toBeFunction(),
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { text: 'owner_data' },
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockToolDefinition({
      name: 'test.send',
      description: 'Send a test message.',
      execution: 'queued',
    }),
  ).toStrictEqual({
    name: 'test.send',
    description: 'Send a test message.',
    input: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    execution: 'queued',
    run: expect.toBeFunction(),
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { text: 'owner_data' },
    },
  });
});

test('it merges a schema override into the default schema and replaces its arrays', () => {
  expect(
    buildMockToolDefinition({
      output: { properties: { delivered: { type: 'boolean' } }, required: ['delivered'] },
    }).output,
  ).toStrictEqual({
    type: 'object',
    properties: { text: { type: 'string' }, delivered: { type: 'boolean' } },
    required: ['delivered'],
    additionalProperties: false,
  });
});

test('it merges a declaration override, results included, into the default declaration', () => {
  expect(
    buildMockToolDefinition({
      declaration: { effects: ['send'], destinations: ['to'], results: { delivered: 'untrusted' } },
    }).declaration,
  ).toStrictEqual({
    effects: ['send'],
    destinations: ['to'],
    amount: null,
    content: [],
    results: { text: 'owner_data', delivered: 'untrusted' },
  });
});

test('it runs the default tool to one note', async () => {
  const definition = buildMockToolDefinition();

  const outcome = await definition.run(
    { callID: 'call-1', tool: definition.name, input: { query: 'milk' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'task-1',
        tools: [definition.name],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { text: 'a note' } });
});
