import { expect, test } from 'bun:test';
import { buildToolRegistry } from './build-tool-registry';
import { buildMockToolDefinition } from './test-utils/build-mock-tool-definition';

test('it finds a registered tool by name', () => {
  const definition = buildMockToolDefinition({ name: 'notes_read' });

  expect(buildToolRegistry([definition]).findTool('notes_read')?.definition).toBe(definition);
});

test('it finds nothing for a name it does not hold', () => {
  expect(buildToolRegistry([buildMockToolDefinition()]).findTool('shell')).toBeNull();
});

test('it refuses two tools with one name', () => {
  expect(() =>
    buildToolRegistry([
      buildMockToolDefinition({ name: 'notes_read' }),
      buildMockToolDefinition({ name: 'notes_read' }),
    ]),
  ).toThrowWithMessage(Error, 'the tool notes_read is defined twice');
});

test('it refuses a send tool that runs direct', () => {
  expect(() =>
    buildToolRegistry([
      buildMockToolDefinition({ name: 'gmail_send', declaration: { effects: ['send'] } }),
    ]),
  ).toThrowWithMessage(Error, 'the tool gmail_send runs direct, but its effects make it queued');
});

test('it refuses a read tool that runs queued', () => {
  expect(() =>
    buildToolRegistry([buildMockToolDefinition({ name: 'notes_read', execution: 'queued' })]),
  ).toThrowWithMessage(Error, 'the tool notes_read runs queued, but its effects make it direct');
});

test('it refuses a result field with no source of content', () => {
  expect(() =>
    buildToolRegistry([
      buildMockToolDefinition({
        output: {
          type: 'object',
          properties: { text: { type: 'string' }, author: { type: 'string' } },
        },
      }),
    ]),
  ).toThrowWithMessage(Error, /unsourced \[author\], unknown \[\]/u);
});

test('it refuses a source of content for a field the result does not have', () => {
  expect(() =>
    buildToolRegistry([
      buildMockToolDefinition({
        declaration: { results: { text: 'owner_data', author: 'untrusted' } },
      }),
    ]),
  ).toThrowWithMessage(Error, /unsourced \[\], unknown \[author\]/u);
});

test('it refuses an input schema that is not an object', () => {
  expect(() =>
    buildToolRegistry([buildMockToolDefinition({ name: 'notes_read', input: { type: 'string' } })]),
  ).toThrowWithMessage(Error, 'the tool notes_read needs an object input schema');
});

test('it reports the path of an input that breaks the input schema', () => {
  const registered = buildToolRegistry([buildMockToolDefinition({ name: 'notes_read' })]).findTool(
    'notes_read',
  );

  expect(registered?.parseInput({ query: 7 })).toStrictEqual({
    isValid: false,
    errors: 'data/query must be string',
  });
});

test('it compiles an input schema only when a call first parses against it', () => {
  const registry = buildToolRegistry([
    buildMockToolDefinition({
      name: 'notes_read',
      input: { properties: { query: { type: 'sentence' } } },
    }),
  ]);

  expect(() => registry.findTool('notes_read')?.parseInput({ query: 'milk' })).toThrow(
    'type must be JSONType or JSONType[]: sentence',
  );
});

test('it accepts an input that meets the input schema', () => {
  const registered = buildToolRegistry([buildMockToolDefinition({ name: 'notes_read' })]).findTool(
    'notes_read',
  );

  expect(registered?.parseInput({ query: 'milk' })).toStrictEqual({ isValid: true });
});

test('it refuses a variant whose effects make the tool run another way', () => {
  expect(() =>
    buildToolRegistry([
      buildMockToolDefinition({
        name: 'jobs_start',
        variants: {
          pick: () => 'send',
          declarations: {
            send: {
              effects: ['send'],
              destinations: [],
              amount: null,
              content: [],
              results: { text: 'owner_data' },
            },
          },
        },
      }),
    ]),
  ).toThrowWithMessage(
    Error,
    'the tool jobs_start/send runs direct, but its effects make it queued',
  );
});

test('it refuses a variant whose result sources miss a field of the result', () => {
  expect(() =>
    buildToolRegistry([
      buildMockToolDefinition({
        name: 'jobs_start',
        variants: {
          pick: () => 'plain',
          declarations: {
            plain: { effects: ['read'], destinations: [], amount: null, content: [], results: {} },
          },
        },
      }),
    ]),
  ).toThrowWithMessage(
    Error,
    'the tool jobs_start/plain needs an object result whose every field has a source: unsourced [text], unknown []',
  );
});

test('it accepts a paid read tool that runs direct', () => {
  const definition = buildMockToolDefinition({
    name: 'web_search',
    paid: { priceMicros: 25_000 },
  });

  expect(buildToolRegistry([definition]).findTool('web_search')?.definition).toBe(definition);
});

test.each([0, -5, 0.5])('it refuses a paid tool with the price %d', (priceMicros) => {
  expect(() =>
    buildToolRegistry([buildMockToolDefinition({ name: 'web_search', paid: { priceMicros } })]),
  ).toThrowWithMessage(Error, 'the paid tool web_search needs a price in whole micros above zero');
});

test('it refuses a paid tool that runs queued', () => {
  expect(() =>
    buildToolRegistry([
      buildMockToolDefinition({
        name: 'shop_order',
        execution: 'queued',
        paid: { priceMicros: 25_000 },
        declaration: { effects: ['send'] },
      }),
    ]),
  ).toThrowWithMessage(
    Error,
    'the paid tool shop_order runs direct, and a queued tool is not paid',
  );
});
