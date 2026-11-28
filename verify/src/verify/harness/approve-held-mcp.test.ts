import { expect, test } from 'bun:test';
import { approveHeldMcp } from './approve-held-mcp';

function setupTest() {
  const asked: unknown[] = [];

  return {
    asked,
    approveWith: (approved: number) =>
      approveHeldMcp((operation, args) => {
        asked.push([operation, args]);

        return Promise.resolve(approved);
      }),
  };
}

test('it asks the server to approve its pending server cards', async () => {
  const ctx = setupTest();

  const approved = await ctx.approveWith(2);

  expect([approved, ctx.asked]).toStrictEqual([2, [['approveMcp', null]]]);
});

test('it fails when the server approved no card', () => {
  const ctx = setupTest();

  expect(ctx.approveWith(0)).rejects.toThrow();
});
