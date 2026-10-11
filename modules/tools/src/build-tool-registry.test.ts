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
    buildToolRegistry([buildMockToolDefinition(), buildMockToolDefinition()]),
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
    buildToolRegistry([buildMockToolDefinition({ execution: 'queued' })]),
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
    buildToolRegistry([buildMockToolDefinition({ input: { type: 'string' } })]),
  ).toThrowWithMessage(Error, 'the tool notes_read needs an object input schema');
});

test('it reports the path of an input that breaks the input schema', () => {
  const registered = buildToolRegistry([buildMockToolDefinition()]).findTool('notes_read');

  expect(registered?.parseInput({ query: 7 })).toStrictEqual({
    isValid: false,
    errors: 'data/query must be string',
  });
});

test('it accepts an input that meets the input schema', () => {
  const registered = buildToolRegistry([buildMockToolDefinition()]).findTool('notes_read');

  expect(registered?.parseInput({ query: 'milk' })).toStrictEqual({ isValid: true });
});
