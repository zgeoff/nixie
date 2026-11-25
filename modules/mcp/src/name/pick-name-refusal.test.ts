import { expect, test } from 'bun:test';
import { buildProxiedToolName, pickNameRefusal } from './pick-name-refusal';

test('it names a proxied tool by its server ID and the server name', () => {
  expect(buildProxiedToolName('tracker', 'item_get')).toBe('tracker.item_get');
});

test('it accepts a name the model can read', () => {
  expect(
    pickNameRefusal({ serverID: 'tracker', toolName: 'item_get', takenModelNames: new Set() }),
  ).toBeNull();
});

test.each(['item get', 'item.get', 'ítem', '', 'a'.repeat(65)])(
  'it refuses the server tool name %p',
  (toolName) => {
    expect(
      pickNameRefusal({ serverID: 'tracker', toolName, takenModelNames: new Set() }),
    ).toContain('outside');
  },
);

test('it refuses a tool whose model name passes 64 characters', () => {
  expect(
    pickNameRefusal({
      serverID: 'tracker',
      toolName: 'a'.repeat(50),
      takenModelNames: new Set(),
    }),
  ).toContain('longer than 64');
});

test('it refuses a tool whose model name another tool holds', () => {
  expect(
    pickNameRefusal({
      serverID: 'tracker',
      toolName: 'item_get',
      takenModelNames: new Set(['mcp__nixie__tracker_item_get']),
    }),
  ).toContain('already holds');
});
