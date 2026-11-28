import type { Transaction } from 'kysely';
import { pickPasskeyChoices } from './pick-passkey-choices';
import type { ProposalAnswerInput, SharedProposal } from './proposal-kind-handler';
import type { PasskeyGate, PasskeyRefusal } from './types';

interface PasskeyQuery {
  readonly row: SharedProposal;
  readonly answer: ProposalAnswerInput;
}

// The passkey step, between the check of the offered choices and the kind's handler. A choice that
// takes no passkey passes untouched. A trust of the place to act takes one on any row, because it
// raises what nixie may do there with no further ask.
export function checkPasskey(
  tx: Transaction<unknown>,
  gate: PasskeyGate | undefined,
  query: PasskeyQuery,
): Promise<PasskeyRefusal | null> {
  const isGated =
    pickPasskeyChoices(query.row).includes(query.answer.choice) || query.answer.trust === 'act';

  if (!isGated) {
    return Promise.resolve(null);
  }

  if (gate === undefined) {
    return Promise.resolve({ error: 'PASSKEY_REQUIRED' });
  }

  if (gate.kind === 'host') {
    return Promise.resolve(null);
  }

  return gate.check(tx, query.row, query.answer);
}
