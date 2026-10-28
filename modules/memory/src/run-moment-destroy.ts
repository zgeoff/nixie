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
import type { WriteInTransaction } from './types';

// The destroy binds to the version the client's preview showed, so an edit after the preview makes
// it stale. The record that marks the moment destroying commits first, so no read delivers the
// moment's text once the keys start to go.
export async function runMomentDestroy(
  context: MomentDestroyContext,
  target: MomentTarget,
  writeInTransaction?: WriteInTransaction,
): Promise<MomentDestroy> {
  const begun = await withWriteTransaction(context.log.writer, async (tx): Promise<string> => {
    await writeInTransaction?.(tx);

    const row = await readMomentRow(tx.$extendTables<MomentTables>(), target.momentID);

    if (row === null || (row.state !== 'active' && row.state !== 'retired')) {
      throw new DestroyRefusedError('not_found');
    }

    if (row.version !== target.version) {
      throw new DestroyRefusedError('stale');
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

    return row.moment_id;
  }).catch((error: unknown) => {
    if (error instanceof DestroyRefusedError) {
      return error;
    }

    throw error;
  });

  if (begun instanceof DestroyRefusedError) {
    return { status: 'refused', reason: begun.reason };
  }

  await runMomentDestroyCleanup(context, begun);

  return { status: 'destroyed', momentID: begun };
}

// A refusal throws inside the transaction, so a client action written by the hook rolls back with it.
class DestroyRefusedError extends Error {
  override readonly name = 'DestroyRefusedError';

  readonly reason: 'not_found' | 'stale';

  constructor(reason: 'not_found' | 'stale') {
    super(`the moment destroy is refused as ${reason}`);

    this.reason = reason;
  }
}
