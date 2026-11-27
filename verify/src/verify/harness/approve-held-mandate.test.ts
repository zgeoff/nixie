import { expect, test } from 'bun:test';
import { approveHeldMandate } from './approve-held-mandate';

function setupTest() {
  const asked: unknown[] = [];

  return {
    asked,
    approveWith: (approved: number) =>
      approveHeldMandate((operation, args) => {
        asked.push([operation, args]);

        return Promise.resolve(approved);
      }),
  };
}

test('it asks the server to approve the mandate cards, and returns how many it approved', async () => {
  const ctx = setupTest();

  const approved = await ctx.approveWith(2);

  expect([approved, ctx.asked]).toStrictEqual([2, [['approveMandate', null]]]);
});

test('it fails when the server approved no card', () => {
  const ctx = setupTest();

  expect(ctx.approveWith(0)).rejects.toThrow();
});
