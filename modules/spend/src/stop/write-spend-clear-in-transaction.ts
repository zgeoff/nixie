import type { WriteTransaction } from '@heynixie/log';
import { readPause, resumeNixieInTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { spendStopClearedCodec } from '../record/spend-stop-cleared-codec';
import type { SpendContext } from '../types';
import type { ClearReason } from './pick-spend-move';
import { readSpendStopRow } from './read-spend-stop-row';

// Writes the clear and resumes nixie when its pause has the cause spending. A pause of another
// cause stays, so a clear never resumes what you paused or what a restore did.
export async function writeSpendClearInTransaction(
  tx: WriteTransaction,
  context: SpendContext,
  reason: ClearReason,
): Promise<boolean> {
  if ((await readSpendStopRow(tx)) === null) {
    return false;
  }

  const definitions = context.definitions();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: spendStopClearedCodec.kind,
      definitions,
      payload: spendStopClearedCodec.encode({ reason }),
    },
  ]);

  const pause = await readPause(tx);

  if (pause?.cause === 'spending') {
    await resumeNixieInTransaction(tx, context.log, { by: 'spend', definitions });
  }

  return true;
}
