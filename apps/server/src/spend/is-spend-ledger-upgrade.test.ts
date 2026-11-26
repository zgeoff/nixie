import { expect, test } from 'bun:test';
import { spendLedgerMigrationVersion } from '@heynixie/db';
import { isSpendLedgerUpgrade } from './is-spend-ledger-upgrade';

test.each([
  { title: 'a start that ran the spend ledger migration', from: -1, to: 0, isUpgrade: true },
  { title: 'a start from the spend ledger version on', from: 0, to: 1, isUpgrade: false },
  { title: 'a start that ran no migration', from: 0, to: 0, isUpgrade: false },
  { title: 'a start that stopped short of it', from: -3, to: -1, isUpgrade: false },
])('it answers $isUpgrade for $title', (row) => {
  const migration = {
    from: spendLedgerMigrationVersion + row.from,
    to: spendLedgerMigrationVersion + row.to,
    copyPath: null,
  };

  expect(isSpendLedgerUpgrade(migration)).toBe(row.isUpgrade);
});
