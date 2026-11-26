import { expect, test } from 'bun:test';
import { approveHeldMcp } from './approve-held-mcp';

function setupTest() {
  const asked: unknown[] = [];

  return {
    asked,
    approveWith: (approved: number, label: 'Add the server' | 'Allow the tool') =>
      approveHeldMcp((operation, args) => {
        asked.push([operation, args]);

        return Promise.resolve(approved);
      }, label),
  };
}

test.each([
  { label: 'Add the server', change: 'server' },
  { label: 'Allow the tool', change: 'tool' },
] as const)('it asks the server to approve the $change cards of the label $label', async (row) => {
  const ctx = setupTest();

  const approved = await ctx.approveWith(2, row.label);

  expect([approved, ctx.asked]).toStrictEqual([2, [['approveMcp', { change: row.change }]]]);
});

test('it fails when the server approved no card', () => {
  const ctx = setupTest();

  expect(ctx.approveWith(0, 'Add the server')).rejects.toThrow();
});
