import type { Writer } from '@heynixie/log';
import type { LeaseKind, TasksTables } from '../types';

export interface TestLease {
  readonly kind: LeaseKind;
  readonly workID: string;
  readonly holder: string | null;
  readonly generation: number;
}

export async function readTestLeases(writer: Pick<Writer, 'db'>): Promise<readonly TestLease[]> {
  const rows = await writer.db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .select(['kind', 'work_id', 'holder', 'generation'])
    .orderBy('kind')
    .orderBy('work_id')
    .execute();

  return rows.map((row) => ({
    kind: row.kind,
    workID: row.work_id,
    holder: row.holder,
    generation: row.generation,
  }));
}
