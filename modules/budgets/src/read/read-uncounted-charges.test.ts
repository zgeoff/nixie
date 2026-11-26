import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { budgetChargedCodec } from '../record/budget-charged-codec';
import { startTestBudgets } from '../test-utils';
import { readUncountedCharges } from './read-uncounted-charges';

test('it totals each budget period of the charges that the migration kept no kind for', async () => {
  const ctx = await startTestBudgets();

  await ctx.seedLegacyChargeKind('old-1', null);
  await ctx.seedLegacyChargeKind('old-2', null);
  await ctx.seedLegacyChargeKind('old-3', 'day');

  await withWriteTransaction(ctx.writer, (tx) =>
    writeRecordsInTransaction(
      tx,
      ctx.log,
      [
        { chargeID: 'old-1', amountMicros: 4_000_000 },
        { chargeID: 'old-2', amountMicros: 1_000_000 },
        { chargeID: 'old-3', amountMicros: 2_000_000 },
      ].map((charge) => ({
        kind: budgetChargedCodec.kind,
        definitions: ctx.context.definitions(),
        payload: budgetChargedCodec.encode({
          ...charge,
          budgetID: 'groceries',
          periodStart: '2026-10-01',
          for: { kind: 'action', id: `action-${charge.chargeID}` },
        }),
      })),
    ),
  );

  const totals = await readUncountedCharges(ctx.writer.db);

  expect(totals).toStrictEqual([
    { budgetID: 'groceries', periodStart: '2026-10-01', amountMicros: 5_000_000 },
  ]);
});

test('it lists nothing when every charge has a ledger key', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 12_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const totals = await readUncountedCharges(ctx.writer.db);

  expect(totals).toStrictEqual([]);
});
