import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import type { SpendContext } from '../types';
import type { RaiseRequest } from './pick-raise-refusal';

// The raise stands in the log before the gateway hears of it, so a gateway that refuses or does not
// answer leaves it, and the watcher sends it again until the day ends.
export async function writeSpendRaiseRecord(
  context: SpendContext,
  request: RaiseRequest & { readonly by: string },
): Promise<void> {
  await withWriteTransaction(context.log.writer, (tx) =>
    writeRecordsInTransaction(tx, context.log, [
      {
        kind: spendLimitRaisedCodec.kind,
        definitions: context.definitions(),
        payload: spendLimitRaisedCodec.encode(request),
      },
    ]),
  );
}
