import { expect, test } from 'bun:test';
import type { McpToolOverride } from '../types';
import { findMcpToolOverride } from './find-mcp-tool-override';

test('it finds the override a file names', () => {
  const override: McpToolOverride = {
    effects: ['send'],
    destinations: [],
    amount: null,
    content: null,
    reconcile: null,
  };

  expect(
    findMcpToolOverride({ tracker: { item_notify: override } }, 'tracker', 'item_notify'),
  ).toBe(override);
});

test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
  'it finds no override for a tool named %s that the file leaves out',
  (tool) => {
    expect(findMcpToolOverride({ tracker: {} }, 'tracker', tool)).toBeNull();
  },
);

test('it finds no override for a server named like an inherited member', () => {
  expect(findMcpToolOverride({}, 'constructor', 'name')).toBeNull();
});
