import { expect, test } from 'bun:test';
import { serverPartDeclarations } from './server-part-declarations';

function setupTest() {
  return {
    findDeclaration: (name: string) =>
      serverPartDeclarations.find((candidate) => candidate.name === name),
  };
}

test.each([
  { part: 'turn_input_work', needed: 'erasure_catch_up', reason: 'the repair and intake wait' },
  { part: 'runners', needed: 'turn_input_work', reason: 'no step runs before the repair' },
  { part: 'erasure_watch', needed: 'erasure_catch_up', reason: 'a retry never races the catch-up' },
])('it makes $part need $needed, so $reason', (row) => {
  const ctx = setupTest();
  const declaration = ctx.findDeclaration(row.part);

  expect(declaration?.needs).toContain(row.needed);
});

test('it lets the mcp part read the tools part, which names the tools a proxied name must not take', () => {
  const ctx = setupTest();
  const declaration = ctx.findDeclaration('mcp');

  expect(declaration?.uses).toContain('tools');
});
