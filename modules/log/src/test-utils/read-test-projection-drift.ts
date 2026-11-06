import { runProjectionRebuild } from '../run-projection-rebuild';
import type { Log, Writer } from '../types';

export async function readTestProjectionDrift(log: Log): Promise<readonly string[]> {
  const tables = [...log.projections.map((projection) => projection.table), 'projection_changes'];
  const readTables = () => Promise.all(tables.map((table) => readTable(log.writer.db, table)));

  const live = await readTables();

  await runProjectionRebuild(log);

  const rebuilt = await readTables();

  return tables.filter((_table, index) => !Bun.deepEquals(live[index], rebuilt[index]));
}

async function readTable(db: Writer['db'], table: string): Promise<readonly unknown[]> {
  const rows = await db
    .$extendTables<Readonly<Record<string, Readonly<Record<string, unknown>>>>>()
    .selectFrom(table)
    .selectAll()
    .execute();

  return rows.map((row) => JSON.stringify(row)).toSorted();
}
