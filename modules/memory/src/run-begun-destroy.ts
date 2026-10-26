import type { MomentDestroyContext, MomentTables } from './moment-types';
import { readMomentRow } from './read-moment-row';
import { runMomentDestroyCleanup } from './run-moment-destroy-cleanup';

export async function runBegunDestroy(
  context: MomentDestroyContext,
  momentID: string,
): Promise<void> {
  const row = await readMomentRow(context.log.writer.db.$extendTables<MomentTables>(), momentID);

  if (row?.state === 'destroying') {
    await runMomentDestroyCleanup(context, row.moment_id);
  }
}
