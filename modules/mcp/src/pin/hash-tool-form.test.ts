import { expect, test } from 'bun:test';
import { buildToolForm } from '../test-utils/build-tool-form';
import type { ToolForm } from '../types';
import { hashToolForm } from './hash-tool-form';

test('it gives the same hash for the same form with its keys in another order', () => {
  const reordered: ToolForm = {
    annotations: { readOnlyHint: true },
    outputSchema: null,
    inputSchema: { required: ['id'], properties: { id: { type: 'string' } }, type: 'object' },
    description: 'Read one item.',
    title: null,
    name: 'item_get',
  };

  expect(hashToolForm(reordered)).toBe(hashToolForm(buildToolForm()));
});

test('it gives the same hash for a string in its composed and decomposed forms', () => {
  const composed = buildToolForm({ description: 'café' });
  const decomposed = buildToolForm({ description: 'café' });

  expect(hashToolForm(decomposed)).toBe(hashToolForm(composed));
});

test('it gives a hash of the sha256 shape', () => {
  expect(hashToolForm(buildToolForm())).toMatch(/^sha256:[0-9a-f]{64}$/u);
});

test.each<{ title: string; changed: Partial<ToolForm> }>([
  { title: 'the description', changed: { description: 'Read one item, then close it.' } },
  { title: 'the title', changed: { title: 'Get' } },
  { title: 'an annotation', changed: { annotations: { readOnlyHint: false } } },
  { title: 'the input schema', changed: { inputSchema: { type: 'object' } } },
  { title: 'the output schema', changed: { outputSchema: { type: 'object' } } },
  { title: 'the name', changed: { name: 'item_read' } },
])('it gives another hash when $title changes', (row) => {
  expect(hashToolForm(buildToolForm(row.changed))).not.toBe(hashToolForm(buildToolForm()));
});
