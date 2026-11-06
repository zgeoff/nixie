import type { LeaseKind, TasksContext, TasksTables } from '../types';

export interface TestLease {
  readonly kind: LeaseKind;
  readonly workID: string;
  readonly holder: string | null;
}

export async function readTestLeases(
  context: Pick<TasksContext, 'log'>,
): Promise<readonly TestLease[]> {
  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .select(['kind', 'work_id', 'holder'])
    .orderBy('kind')
    .orderBy('work_id')
    .execute();

  return rows.map((row) => ({ kind: row.kind, workID: row.work_id, holder: row.holder }));
}
