import type { LogTables } from '@heynixie/log';
import type { ModelsRecordKind } from '@heynixie/models';
import type { Transaction } from 'kysely';
import type { PageSession } from './get-page-session';

// the models module registers the invalidation's kind with the log, and a forget's cleanup commits
// it before it removes the thread's links and pages
const invalidatedKind: ModelsRecordKind = 'model.session_invalidated';

export async function probeSessionEnded(
  tx: Transaction<unknown>,
  session: PageSession,
): Promise<boolean> {
  if (session.invalidatedThrough === null) {
    return false;
  }

  const newest = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((query) => query.fn.max('sequence').as('sequence'))
    .where('thread', '=', session.thread)
    .where('kind', '=', invalidatedKind)
    .executeTakeFirst();

  return (newest?.sequence ?? 0) > session.invalidatedThrough;
}
