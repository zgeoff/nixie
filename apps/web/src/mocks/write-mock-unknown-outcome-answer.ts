import type { ContractInputs } from '@heynixie/contract';
import { store } from './store';

export type MockUnknownAnswer = ContractInputs['approvals']['answerUnknownOutcome'];

export type MockUnknownResult =
  | { readonly status: 'answered' }
  | { readonly status: 'not_allowed' }
  | { readonly status: 'passkey_refused'; readonly refusal: 'NO_PASSKEY' | 'PASSKEY_REQUIRED' };

const states = { happened: 'happened', retry: 'retried', drop: 'dropped' } as const;

// An answer about an unknown outcome, as the host takes it: only an action that waits can be
// answered, and a retry of an always-ask or lifting action takes a passkey first.
export async function writeMockUnknownOutcomeAnswer(
  answer: MockUnknownAnswer,
): Promise<MockUnknownResult> {
  const row = store.unknownOutcomeRows.findFirst((query) =>
    query.where((candidate) => candidate.actionID === answer.actionID),
  );

  if (row === undefined || row.state !== 'waiting') {
    return { status: 'not_allowed' };
  }

  if (answer.choice === 'retry' && row.riskClass !== 'routine') {
    if (store.passkeyRows.findFirst((query) => query.where({ revokedAt: null })) === undefined) {
      return { status: 'passkey_refused', refusal: 'NO_PASSKEY' };
    }

    if (answer.passkey === undefined) {
      return { status: 'passkey_refused', refusal: 'PASSKEY_REQUIRED' };
    }
  }

  await store.unknownOutcomeRows.update(row, {
    data: (draft) => {
      draft.state = states[answer.choice];
    },
  });

  return { status: 'answered' };
}
