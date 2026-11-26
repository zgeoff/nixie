import { expect, test } from 'bun:test';
import { buildToolForm } from '../test-utils/build-tool-form';
import { pickFormRefusal } from './pick-form-refusal';

test('it refuses a form whose input schema cannot compile', () => {
  const form = buildToolForm({
    name: 'item_get',
    inputSchema: { type: 'object', properties: { owner: { $ref: '#/$defs/missing' } } },
  });

  expect(pickFormRefusal('tracker.item_get', form)).toBe('a schema of the form does not compile');
});

test('it refuses a form whose output schema cannot compile', () => {
  const form = buildToolForm({
    name: 'item_get',
    annotations: { readOnlyHint: true },
    outputSchema: { type: 'object', properties: { owner: { $ref: '#/$defs/missing' } } },
  });

  expect(pickFormRefusal('tracker.item_get', form)).toBe('a schema of the form does not compile');
});

test('it accepts a form whose schemas compile', () => {
  const form = buildToolForm({
    name: 'item_get',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
  });

  expect(pickFormRefusal('tracker.item_get', form)).toBeNull();
});
