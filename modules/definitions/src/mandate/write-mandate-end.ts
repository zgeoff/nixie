import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { writeRuntimeRuleState } from '../runtime/write-runtime-rule-state';
import { mandateEndedCodec } from './mandate-ended-codec';
import { readActiveMandates } from './read-active-mandates';

export interface MandateEndRequest {
  readonly mandateID: string;
  readonly reason: 'ended' | 'expired';
}

export type MandateEnd = { readonly status: 'ended' } | { readonly status: 'not_active' };

// Retires every in-force change of the mandate and records the end. It writes no removal, so the
// export never offers to remove a rule of yours. The caller owns the transaction and runs the
// in-force seed after it commits. A mandate that already ended writes nothing.
export async function writeMandateEnd(
  tx: Transaction<unknown>,
  context: ProposalContext,
  end: MandateEndRequest,
): Promise<MandateEnd> {
  const active = await readActiveMandates(tx);

  const mandate = active.find((entry) => entry.mandateID === end.mandateID);

  if (mandate === undefined) {
    return { status: 'not_active' };
  }

  const at = context.clock.now();

  for (const changeID of mandate.changeIDs) {
    await writeRuntimeRuleState(tx, { changeID, to: 'retired', at });
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: mandateEndedCodec.kind,
      definitions: context.definitions(),
      payload: mandateEndedCodec.encode({
        mandateID: end.mandateID,
        reason: end.reason,
        changeIDs: [...mandate.changeIDs],
      }),
    },
  ]);

  return { status: 'ended' };
}
