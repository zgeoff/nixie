import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import { readSpendRaise } from '../stop/read-spend-raise';
import type { SpendContext } from '../types';
import type { RaiseRequest } from './pick-raise-refusal';

export interface WrittenRaise {
  readonly start: string;
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
}

// A raise that the gateway did not answer stands, and the watcher sends it again until the day ends.
// The earlier raise is read in the transaction, so two raises at once leave the larger totals.
export function writeSpendRaiseRecord(
  context: SpendContext,
  request: RaiseRequest & { readonly by: string },
): Promise<WrittenRaise> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const earlier = await readSpendRaise(tx, request.start);

    const totals = {
      start: request.start,
      dollars: Math.max(request.dollars, earlier?.dollars ?? 0),
      tokens: Math.max(request.tokens, earlier?.tokens ?? 0),
      turns: Math.max(request.turns, earlier?.turns ?? 0),
    };

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: spendLimitRaisedCodec.kind,
        definitions: context.definitions(),
        payload: spendLimitRaisedCodec.encode({ ...totals, by: request.by }),
      },
    ]);

    return totals;
  });
}
