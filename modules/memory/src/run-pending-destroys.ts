import type { MomentDestroyContext, MomentTables } from './moment-types';
import { runMomentDestroyCleanup } from './run-moment-destroy-cleanup';

export async function runPendingDestroys(context: MomentDestroyContext): Promise<void> {
  const pending = await context.log.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moments')
    .select('moment_id')
    .where('state', '=', 'destroying')
    .orderBy('updated_sequence')
    .execute();

  for (const row of pending) {
    await runMomentDestroyCleanup(context, row.moment_id);
  }
}
