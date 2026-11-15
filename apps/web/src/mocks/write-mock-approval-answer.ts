import type { ContractInputs } from '@heynixie/contract';
import { pickMockPasskeyChoices } from './pick-mock-passkey-choices';
import { store } from './store';

export type MockApprovalAnswer = ContractInputs['approvals']['answerProposal'];

type MockApprovalState = 'pending' | 'deferred' | 'approved' | 'declined' | 'lapsed' | 'withdrawn';

export type MockApprovalResult =
  | {
      readonly status: 'answered';
      readonly result:
        | {
            readonly proposalID: string;
            readonly state: 'approved';
            readonly rule?: { readonly id: string; readonly revision: number };
          }
        | { readonly proposalID: string; readonly state: 'declined' | 'deferred' }
        | {
            readonly proposalID: string;
            readonly state: 'pending';
            readonly closeMatch: { itemID: string; text: string; version: number };
          };
    }
  | {
      readonly status: 'refused';
      readonly refusal:
        | {
            readonly error: 'CONFLICT';
            readonly current: { actionHash: string; ruleHash: string | null };
          }
        | { readonly error: 'CLOSED'; readonly state: MockApprovalState }
        | { readonly error: 'NOT_ALLOWED'; readonly reason: string };
    }
  | {
      readonly status: 'passkey_refused';
      readonly refusal: 'NO_PASSKEY' | 'PASSKEY_REQUIRED';
    };

// An answer to one row, as the host answers it: the hashes the card showed must match, and a
// closed row refuses.
export async function writeMockApprovalAnswer(
  answer: MockApprovalAnswer,
  callerSessionID: string,
): Promise<MockApprovalResult> {
  const row = store.approvalRows.findFirst((query) =>
    query.where(
      (candidate) =>
        candidate.proposalID === answer.proposalID || candidate.shortID === answer.proposalID,
    ),
  );

  if (row === undefined) {
    return refuse({ error: 'NOT_ALLOWED', reason: 'not_found' });
  }

  if (row.state !== 'pending' && row.state !== 'deferred') {
    return refuse({ error: 'CLOSED', state: row.state });
  }

  if (!row.choices.includes(answer.choice)) {
    return refuse({ error: 'NOT_ALLOWED', reason: 'choice' });
  }

  const isRuleStale = answer.choice === 'always_allow' && answer.ruleHash !== row.ruleHash;

  if (answer.actionHash !== row.actionHash || isRuleStale) {
    return refuse({
      error: 'CONFLICT',
      current: { actionHash: row.actionHash, ruleHash: row.ruleHash },
    });
  }

  const passkeyRefusal = await checkMockPasskey(row, answer);

  if (passkeyRefusal !== null) {
    return { status: 'passkey_refused', refusal: passkeyRefusal };
  }

  const proposalID = row.proposalID;

  if (answer.choice === 'defer') {
    await store.approvalRows.update(row, {
      data: (draft) => {
        draft.deferGeneration = row.deferGeneration + 1;
        draft.deferUntil = answer.deferUntil ?? new Date(Date.now() + 60 * 60 * 1000);
        draft.state = 'deferred';
      },
    });

    return answered({ proposalID, state: 'deferred' });
  }

  if (answer.choice === 'decline') {
    await store.approvalRows.update(row, {
      data: (draft) => {
        draft.answeredBy = callerSessionID;
        draft.state = 'declined';
      },
    });

    return answered({ proposalID, state: 'declined' });
  }

  return writeApproval(row, answer, callerSessionID);
}

function refuse(
  refusal: Extract<MockApprovalResult, { status: 'refused' }>['refusal'],
): MockApprovalResult {
  return { status: 'refused', refusal };
}

type StoredRow = NonNullable<ReturnType<typeof store.approvalRows.findFirst>>;

// The passkey step, as the host runs it, except that the mock keeps the assertion it was given
// instead of checking its signature.
async function checkMockPasskey(
  row: StoredRow,
  answer: MockApprovalAnswer,
): Promise<'NO_PASSKEY' | 'PASSKEY_REQUIRED' | null> {
  if (!pickMockPasskeyChoices(row).includes(answer.choice)) {
    return null;
  }

  if (store.passkeyRows.findFirst((query) => query.where({ revokedAt: null })) === undefined) {
    return 'NO_PASSKEY';
  }

  if (answer.passkey === undefined) {
    return 'PASSKEY_REQUIRED';
  }

  await store.passkeyChecks.create({
    challenge: readChallenge(answer.passkey.response.clientDataJSON),
    choice: answer.choice,
    credentialID: answer.passkey.id,
    proposalID: row.proposalID,
  });

  return null;
}

function readChallenge(clientDataJSON: string): string {
  const data: unknown = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));

  return typeof data === 'object' && data !== null && 'challenge' in data
    ? String(data.challenge)
    : '';
}

function answered(
  result: Extract<MockApprovalResult, { status: 'answered' }>['result'],
): MockApprovalResult {
  return { status: 'answered', result };
}

async function writeApproval(
  row: StoredRow,
  answer: MockApprovalAnswer,
  callerSessionID: string,
): Promise<MockApprovalResult> {
  const proposalID = row.proposalID;

  const isClosedMatch =
    answer.memory?.revisionOf !== undefined || answer.memory?.ignoreCloseMatch === true;

  if (row.closeMatch !== undefined && !isClosedMatch) {
    return answered({ proposalID, state: 'pending', closeMatch: { ...row.closeMatch } });
  }

  const rule = answer.choice === 'always_allow' ? await writeRule(row) : undefined;

  await store.approvalRows.update(row, {
    data: (draft) => {
      draft.answeredBy = callerSessionID;
      draft.appliedText = answer.memory?.editedText ?? row.memory?.text ?? row.sentence;
      draft.state = 'approved';
    },
  });

  return answered({ proposalID, state: 'approved', ...(rule === undefined ? {} : { rule }) });
}

async function writeRule(row: StoredRow): Promise<{ id: string; revision: number } | undefined> {
  if (row.rule === undefined) {
    return undefined;
  }

  const created = await store.rules.create({
    destinations: [...row.rule.destinations],
    ruleID: row.rule.ruleID,
    sentence: row.ruleSentence ?? 'Allow it.',
  });

  return { id: created.ruleID, revision: created.revision };
}
