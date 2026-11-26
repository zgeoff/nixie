import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { budgetChargedCodec } from '../record/budget-charged-codec';
import type { BudgetsContext, ChargeRequest, ChargeResult } from '../types';
import { pickChargeRefusal } from './pick-charge-refusal';
import { readChargeFacts } from './read-charge-facts';

// One transaction charges every named budget or none. The caller's write transaction is the only
// writer, so 2 charges at the same moment never both fit in the last of a budget.
export async function chargeBudgetsInTransaction(
  tx: Transaction<unknown>,
  context: BudgetsContext,
  request: ChargeRequest,
): Promise<ChargeResult> {
  invariant(request.amountMicros > 0, 'a charge is a whole number of micros above zero');

  const facts = await readChargeFacts(tx, context, request.budgetIDs);

  if ('error' in facts) {
    return facts;
  }

  const refusal = request.overdraw === true ? null : pickChargeRefusal(facts, request.amountMicros);

  if (refusal !== null) {
    return refusal;
  }

  const charges = facts.map((fact) => ({
    chargeID: crypto.randomUUID(),
    budgetID: fact.limit.id,
    periodStart: fact.periodStart,
    ledgerKey: fact.ledgerKey,
    amountMicros: request.amountMicros,
    for: { kind: request.for.kind, id: request.for.id },
  }));

  await writeRecordsInTransaction(
    tx,
    context.log,
    charges.map((payload) => ({
      kind: budgetChargedCodec.kind,
      definitions: context.definitions(),
      payload: budgetChargedCodec.encode(payload),
    })),
  );

  return { chargeIDs: charges.map((charge) => charge.chargeID) };
}
