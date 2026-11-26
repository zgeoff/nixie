import { expect, test } from 'bun:test';
import { parseToolForm } from './parse-tool-form';

test('it reads a listed tool and leaves out _meta and every other field of the form', () => {
  const form = parseToolForm({
    name: 'item_get',
    description: 'Read one item.',
    inputSchema: { type: 'object' },
    annotations: { readOnlyHint: true },
    _meta: { ui: 'x' },
    icons: [{ source: 'https://example.org/i.png' }],
  });

  expect(form).toStrictEqual({
    name: 'item_get',
    title: null,
    description: 'Read one item.',
    inputSchema: { type: 'object' },
    outputSchema: null,
    annotations: { readOnlyHint: true },
  });
});

test('it gives null for a tool with no input schema', () => {
  expect(parseToolForm({ name: 'item_get' })).toBeNull();
});

test('it gives null for a value that is not an object', () => {
  expect(parseToolForm('item_get')).toBeNull();
});
