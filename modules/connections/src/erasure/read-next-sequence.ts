import type { LogTables, WriteTransaction } from '@heynixie/log';

// The sequence that the next record takes: past the last record of the log.
export async function readNextSequence(tx: WriteTransaction): Promise<number> {
  const row = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('last'))
    .executeTakeFirst();

  return (row?.last ?? 0) + 1;
}
