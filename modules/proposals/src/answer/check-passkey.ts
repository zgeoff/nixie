import type { Transaction } from 'kysely';
import { pickPasskeyChoices } from './pick-passkey-choices';
import type { ProposalAnswerInput, SharedProposal } from './proposal-kind-handler';
import type { PasskeyGate, PasskeyRefusal } from './types';

interface PasskeyQuery {
  readonly row: SharedProposal;
  readonly answer: ProposalAnswerInput;
}

// The passkey step, between the check of the offered choices and the kind's handler. A choice that
// takes no passkey passes untouched.
export async function checkPasskey(
  tx: Transaction<unknown>,
  gate: PasskeyGate | undefined,
  query: PasskeyQuery,
): Promise<PasskeyRefusal | null> {
  if (!pickPasskeyChoices(query.row).includes(query.answer.choice)) {
    return null;
  }

  if (gate === undefined) {
    return { error: 'PASSKEY_REQUIRED' };
  }

  if (gate.kind === 'host') {
    return null;
  }

  return await gate.check(tx, query.row, query.answer);
}
