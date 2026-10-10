import { expect, test } from 'bun:test';
import { buildMockToolDefinition } from './build-mock-tool-definition';

test('it builds a default tool definition', () => {
  // the last test runs the default tool
  const { run: _run, ...definition } = buildMockToolDefinition();

  expect(definition).toStrictEqual({
    name: 'notes_read',
    description: 'Read one of your notes.',
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
  expect(buildMockToolDefinition({ name: 'test.send', execution: 'queued' })).toMatchObject({
    name: 'test.send',
    description: 'Read one of your notes.',
    execution: 'queued',
  });
});

test('it merges a declaration override into the default declaration', () => {
  expect(
    buildMockToolDefinition({ declaration: { effects: ['send'], destinations: ['to'] } })
      .declaration,
  ).toStrictEqual({
    effects: ['send'],
    destinations: ['to'],
    amount: null,
    content: [],
    results: { text: 'owner_data' },
  });
});

test('it runs the default tool to one note', async () => {
  const definition = buildMockToolDefinition();

  const outcome = await definition.run(
    { callID: 'call-1', tool: 'notes_read', input: { query: 'milk' }, toolUseID: null },
    { run: { runID: 'run-1', thread: 'task-1', tools: ['notes_read'] } },
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { text: 'a note' } });
});
