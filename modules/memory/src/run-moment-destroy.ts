import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { momentDestroyedCodec } from './moment-destroyed-codec';
import type {
  MomentDestroy,
  MomentDestroyContext,
  MomentTables,
  MomentTarget,
} from './moment-types';
import { readMomentRow } from './read-moment-row';
import { runMomentDestroyCleanup } from './run-moment-destroy-cleanup';

// The destroy binds to the version the client's preview showed, so an edit after the preview makes
// it stale. The record that marks the moment destroying commits first, so no read delivers the
// moment's text once the keys start to go.
export async function runMomentDestroy(
  context: MomentDestroyContext,
  target: MomentTarget,
): Promise<MomentDestroy> {
  const begun = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<MomentDestroy> => {
      const row = await readMomentRow(tx.$extendTables<MomentTables>(), target.momentID);

      if (row === null || (row.state !== 'active' && row.state !== 'retired')) {
        return { status: 'refused', reason: 'not_found' };
      }

      if (row.version !== target.version) {
        return { status: 'refused', reason: 'stale' };
      }

      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'moment_destroyed',
          definitions: context.definitions(),
          payload: momentDestroyedCodec.encode({
            momentID: row.moment_id,
            version: row.version,
            stage: 'started',
          }),
        },
      ]);

      return { status: 'destroyed', momentID: row.moment_id };
    },
  );

  if (begun.status === 'destroyed') {
    await runMomentDestroyCleanup(context, begun.momentID);
  }

  return begun;
}
