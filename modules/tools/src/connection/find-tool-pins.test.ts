import { expect, test } from 'bun:test';
import { findToolPins } from './find-tool-pins';

function setupTest() {
  return { pinsOf: (tool: string) => findToolPins({ 'gmail.search': ['k3x9m2p7qa'] }, tool) };
}

test.each(['gmail.search', 'mcp__nixie__gmail_search'])('it finds the pins of %s', (tool) => {
  const ctx = setupTest();

  expect(ctx.pinsOf(tool)).toStrictEqual(['k3x9m2p7qa']);
});

test('it finds nothing for a tool the pins leave out', () => {
  const ctx = setupTest();

  expect(ctx.pinsOf('gmail.read')).toBeUndefined();
});

test('it finds nothing when the run holds no pins', () => {
  expect(findToolPins(undefined, 'gmail.search')).toBeUndefined();
});
